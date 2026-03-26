import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { WeeklyTimesheetStatus } from '@prisma/client';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type ReminderConfig = {
  enabled: boolean;
  missingTime: boolean;
  openSignatures: boolean;
  openApprovals: boolean;
  projectStart: boolean;
  emailEnabled: boolean;
  intervalHours: number;
};

const DEFAULT_CONFIG: ReminderConfig = {
  enabled: false,
  missingTime: false,
  openSignatures: false,
  openApprovals: false,
  projectStart: false,
  emailEnabled: false,
  intervalHours: 24,
};

const CONFIG_KEY = 'reminders.config';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Config ──────────────────────────────────

  async getConfig(): Promise<ReminderConfig> {
    const row = await this.prisma.setting.findUnique({
      where: { key: CONFIG_KEY },
    });
    if (!row) return { ...DEFAULT_CONFIG };
    const val = row.valueJson as Record<string, unknown>;
    return {
      enabled: val.enabled === true,
      missingTime: val.missingTime === true,
      openSignatures: val.openSignatures === true,
      openApprovals: val.openApprovals === true,
      projectStart: val.projectStart === true,
      emailEnabled: val.emailEnabled === true,
      intervalHours:
        typeof val.intervalHours === 'number' ? val.intervalHours : 24,
    };
  }

  async updateConfig(data: Partial<ReminderConfig>): Promise<ReminderConfig> {
    const current = await this.getConfig();
    const next = { ...current, ...data };
    const jsonValue = next as unknown as Parameters<typeof this.prisma.setting.create>[0]['data']['valueJson'];
    await this.prisma.setting.upsert({
      where: { key: CONFIG_KEY },
      update: { valueJson: jsonValue },
      create: { key: CONFIG_KEY, valueJson: jsonValue },
    });
    return next;
  }

  // ── Scheduler (alle 60min prüfen) ──────────

  @Interval(3600000)
  async scheduledCheck() {
    try {
      const config = await this.getConfig();
      if (!config.enabled) return;
      await this.runReminders(config);
    } catch (error) {
      this.logger.error('Reminder-Check fehlgeschlagen', error);
    }
  }

  // ── Manueller Trigger ─────────────────────

  async runReminders(config?: ReminderConfig) {
    const cfg = config ?? (await this.getConfig());
    const results: string[] = [];

    if (cfg.openSignatures) {
      const count = await this.remindOpenSignatures(cfg);
      results.push(`Offene Signaturen: ${count} Erinnerungen`);
    }

    if (cfg.openApprovals) {
      const count = await this.remindOpenApprovals(cfg);
      results.push(`Offene Freigaben: ${count} Erinnerungen`);
    }

    if (cfg.projectStart) {
      const count = await this.remindProjectStart(cfg);
      results.push(`Projektstart: ${count} Erinnerungen`);
    }

    if (cfg.missingTime) {
      const count = await this.remindMissingTime(cfg);
      results.push(`Fehlende Zeiten: ${count} Erinnerungen`);
    }

    return { results };
  }

  // ── Offene Signaturen ─────────────────────

  private async remindOpenSignatures(cfg: ReminderConfig): Promise<number> {
    const sheets = await this.prisma.weeklyTimesheet.findMany({
      where: {
        status: {
          in: [
            WeeklyTimesheetStatus.DRAFT,
            WeeklyTimesheetStatus.WORKER_SIGNED,
          ],
        },
      },
      include: {
        worker: { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { select: { projectNumber: true, title: true } },
      },
    });

    let count = 0;
    for (const sheet of sheets) {
      const entityId = sheet.id;
      const type =
        sheet.status === 'DRAFT'
          ? 'OPEN_WORKER_SIGN'
          : 'OPEN_CUSTOMER_SIGN';

      if (await this.alreadySent(type, entityId, sheet.workerId)) continue;

      const weekLabel = `KW${sheet.weekNumber}/${sheet.weekYear}`;
      const title =
        type === 'OPEN_WORKER_SIGN'
          ? `Stundenzettel ${weekLabel} wartet auf Signatur`
          : `Stundenzettel ${weekLabel} wartet auf Kundenunterschrift`;
      const body = `Projekt: ${sheet.project.projectNumber} — ${sheet.project.title}`;

      if (type === 'OPEN_WORKER_SIGN') {
        await this.notifications.notifyWorker(
          sheet.workerId,
          'MISSING_TIME',
          title,
          body,
          'TIMESHEET',
          sheet.id,
        );
      }

      await this.notifications.notifyAdmins(
        'MISSING_TIME',
        title,
        body,
        'TIMESHEET',
        sheet.id,
      );

      if (cfg.emailEnabled) {
        await this.sendReminderEmail(
          sheet.worker.email,
          title,
          body,
        );
      }

      await this.logSent(type, entityId, sheet.workerId);
      count++;
    }
    return count;
  }

  // ── Offene Freigaben ──────────────────────

  private async remindOpenApprovals(cfg: ReminderConfig): Promise<number> {
    // Stundenzettel die COMPLETED sind, aber nicht APPROVED
    const sheets = await this.prisma.weeklyTimesheet.findMany({
      where: {
        status: WeeklyTimesheetStatus.COMPLETED,
        approvedAt: null,
      },
      include: {
        project: { select: { projectNumber: true } },
      },
    });

    let count = 0;
    for (const sheet of sheets) {
      if (await this.alreadySent('OPEN_APPROVAL', sheet.id, 'admins'))
        continue;

      const weekLabel = `KW${sheet.weekNumber}/${sheet.weekYear}`;
      await this.notifications.notifyAdmins(
        'APPROVAL',
        `Stundenzettel ${weekLabel} wartet auf Freigabe`,
        `Projekt: ${sheet.project.projectNumber}`,
        'TIMESHEET',
        sheet.id,
      );

      await this.logSent('OPEN_APPROVAL', sheet.id, 'admins');
      count++;
    }

    // Dokumente die SUBMITTED sind
    const docs = await this.prisma.document.findMany({
      where: { approvalStatus: 'SUBMITTED' },
      select: { id: true, title: true, originalFilename: true },
    });

    for (const doc of docs) {
      if (await this.alreadySent('OPEN_DOC_APPROVAL', doc.id, 'admins'))
        continue;

      await this.notifications.notifyAdmins(
        'APPROVAL',
        `Dokument wartet auf Freigabe`,
        `"${doc.title ?? doc.originalFilename}"`,
        'DOCUMENT',
        doc.id,
      );

      await this.logSent('OPEN_DOC_APPROVAL', doc.id, 'admins');
      count++;
    }

    return count;
  }

  // ── Projektstart ──────────────────────────

  private async remindProjectStart(cfg: ReminderConfig): Promise<number> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        active: true,
        startDate: { lte: tomorrow, gte: new Date() },
      },
      include: {
        worker: { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { select: { id: true, projectNumber: true, title: true } },
      },
    });

    let count = 0;
    for (const a of assignments) {
      if (await this.alreadySent('PROJECT_START', a.id, a.workerId))
        continue;

      const title = `Projektstart morgen: ${a.project.projectNumber}`;
      const body = `Dein Einsatz auf "${a.project.title}" beginnt am ${a.startDate.toISOString().slice(0, 10)}.`;

      await this.notifications.notifyWorker(
        a.workerId,
        'ASSIGNMENT',
        title,
        body,
        'PROJECT',
        a.project.id,
      );

      if (cfg.emailEnabled && a.worker.email) {
        await this.sendReminderEmail(a.worker.email, title, body);
      }

      await this.logSent('PROJECT_START', a.id, a.workerId);
      count++;
    }
    return count;
  }

  // ── Fehlende Zeiten ───────────────────────

  private async remindMissingTime(cfg: ReminderConfig): Promise<number> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Finde aktive Monteure mit laufenden Zuordnungen
    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        active: true,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: yesterday } }],
      },
      include: {
        worker: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    const workerIds = [...new Set(assignments.map((a) => a.workerId))];
    let count = 0;

    for (const wid of workerIds) {
      const dayKey = yesterday.toISOString().slice(0, 10);
      if (await this.alreadySent('MISSING_TIME', dayKey, wid)) continue;

      const entries = await this.prisma.timeEntry.count({
        where: {
          workerId: wid,
          occurredAtClient: { gte: yesterday, lte: yesterdayEnd },
        },
      });

      if (entries === 0) {
        const worker = assignments.find((a) => a.workerId === wid)?.worker;
        const title = 'Fehlende Zeitbuchung';
        const body = `Fuer gestern (${dayKey}) liegen keine Zeitbuchungen vor.`;

        await this.notifications.notifyWorker(
          wid,
          'MISSING_TIME',
          title,
          body,
        );

        if (cfg.emailEnabled && worker?.email) {
          await this.sendReminderEmail(worker.email, title, body);
        }

        await this.logSent('MISSING_TIME', dayKey, wid);
        count++;
      }
    }
    return count;
  }

  // ── Hilfsfunktionen ───────────────────────

  private async alreadySent(
    type: string,
    entityId: string,
    recipientId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        type_entityId_channel_recipientId: {
          type,
          entityId,
          channel: 'IN_APP',
          recipientId,
        },
      },
    });
    return !!existing;
  }

  private async logSent(
    type: string,
    entityId: string,
    recipientId: string,
  ) {
    await this.prisma.reminderLog.upsert({
      where: {
        type_entityId_channel_recipientId: {
          type,
          entityId,
          channel: 'IN_APP',
          recipientId,
        },
      },
      update: { sentAt: new Date() },
      create: { type, entityId, channel: 'IN_APP', recipientId },
    });
  }

  private async sendReminderEmail(
    to: string | null | undefined,
    subject: string,
    body: string,
  ) {
    if (!to) return;

    try {
      const smtp = await this.prisma.smtpConfig.findFirst();
      if (!smtp?.host) return;

      const transport = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth:
          smtp.user && smtp.password
            ? { user: smtp.user, pass: smtp.password }
            : undefined,
      });

      await transport.sendMail({
        from: smtp.fromEmail,
        to,
        subject: `[CRM] ${subject}`,
        text: body,
        html: `<div style="font-family:sans-serif;font-size:14px"><h2>${subject}</h2><p>${body}</p><hr/><p style="font-size:12px;color:#888">Diese E-Mail wurde automatisch vom CRM-System gesendet.</p></div>`,
      });

      await this.prisma.reminderLog.upsert({
        where: {
          type_entityId_channel_recipientId: {
            type: 'EMAIL',
            entityId: subject,
            channel: 'EMAIL',
            recipientId: to,
          },
        },
        update: { sentAt: new Date(), status: 'SENT' },
        create: {
          type: 'EMAIL',
          entityId: subject,
          channel: 'EMAIL',
          recipientId: to,
          status: 'SENT',
        },
      });
    } catch (error) {
      this.logger.warn(`E-Mail an ${to} fehlgeschlagen: ${error}`);
    }
  }
}
