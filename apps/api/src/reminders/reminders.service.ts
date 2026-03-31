import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  OfficeReminderKind,
  OfficeReminderStatus,
  RoleCode,
  WeeklyTimesheetStatus,
} from '@prisma/client';
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

type OfficeReminderInput = {
  title?: string;
  description?: string | null;
  kind?: string;
  dueAt?: string | null;
  remindAt?: string | null;
  channels?: string[];
  smsNumber?: string | null;
  assignedUserId?: string;
  customerId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  noteId?: string | null;
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
const OFFICE_REMINDER_TYPE = 'OFFICE_REMINDER';
const OFFICE_CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'CALENDAR'] as const;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  private readonly officeReminderInclude = {
    assignedUser: {
      select: { id: true, displayName: true, email: true },
    },
    createdBy: {
      select: { id: true, displayName: true, email: true },
    },
    completedBy: {
      select: { id: true, displayName: true, email: true },
    },
    customer: {
      select: { id: true, companyName: true, customerNumber: true },
    },
    contact: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        customer: {
          select: { id: true, companyName: true, customerNumber: true },
        },
      },
    },
    project: {
      select: {
        id: true,
        title: true,
        projectNumber: true,
        customerId: true,
        customer: {
          select: { id: true, companyName: true, customerNumber: true },
        },
      },
    },
    note: {
      select: {
        id: true,
        title: true,
        content: true,
        customerId: true,
        contactId: true,
        projectId: true,
      },
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
    const jsonValue = next as unknown as Parameters<
      typeof this.prisma.setting.create
    >[0]['data']['valueJson'];
    await this.prisma.setting.upsert({
      where: { key: CONFIG_KEY },
      update: { valueJson: jsonValue },
      create: { key: CONFIG_KEY, valueJson: jsonValue },
    });
    return next;
  }

  async listOfficeReminders(status?: string) {
    const normalizedStatus = this.parseReminderStatus(status, false);
    return this.prisma.officeReminder.findMany({
      where: normalizedStatus ? { status: normalizedStatus } : undefined,
      include: this.officeReminderInclude,
      orderBy: [{ status: 'asc' }, { remindAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getOfficeReminderReferenceData() {
    const [users, customers, contacts, projects, notes] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          isActive: true,
          roles: {
            some: {
              role: {
                code: { in: [RoleCode.SUPERADMIN, RoleCode.OFFICE] },
              },
            },
          },
        },
        select: { id: true, displayName: true, email: true },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.customer.findMany({
        where: { deletedAt: null },
        select: { id: true, companyName: true, customerNumber: true },
        orderBy: { companyName: 'asc' },
      }),
      this.prisma.customerContact.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          customerId: true,
          customer: {
            select: { id: true, companyName: true, customerNumber: true },
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.project.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          projectNumber: true,
          customerId: true,
          customer: {
            select: { id: true, companyName: true, customerNumber: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.note.findMany({
        select: {
          id: true,
          title: true,
          content: true,
          customerId: true,
          contactId: true,
          projectId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return { users, customers, contacts, projects, notes };
  }

  async createOfficeReminder(dto: OfficeReminderInput, createdByUserId: string) {
    const data = await this.normalizeOfficeReminderInput(dto);
    const created = await this.prisma.officeReminder.create({
      data: {
        ...data,
        createdByUserId,
      },
      include: this.officeReminderInclude,
    });
    await this.clearOfficeReminderLogs(created.id);
    return created;
  }

  async updateOfficeReminder(
    id: string,
    dto: OfficeReminderInput,
    _updatedByUserId: string,
  ) {
    await this.getOfficeReminderOrThrow(id);
    const data = await this.normalizeOfficeReminderInput(dto);
    const updated = await this.prisma.officeReminder.update({
      where: { id },
      data: {
        ...data,
        status: OfficeReminderStatus.OPEN,
        completedAt: null,
        completedByUserId: null,
      },
      include: this.officeReminderInclude,
    });
    await this.clearOfficeReminderLogs(id);
    return updated;
  }

  async completeOfficeReminder(id: string, userId: string) {
    await this.getOfficeReminderOrThrow(id);
    return this.prisma.officeReminder.update({
      where: { id },
      data: {
        status: OfficeReminderStatus.COMPLETED,
        completedAt: new Date(),
        completedByUserId: userId,
      },
      include: this.officeReminderInclude,
    });
  }

  async reopenOfficeReminder(id: string) {
    await this.getOfficeReminderOrThrow(id);
    const updated = await this.prisma.officeReminder.update({
      where: { id },
      data: {
        status: OfficeReminderStatus.OPEN,
        completedAt: null,
        completedByUserId: null,
      },
      include: this.officeReminderInclude,
    });
    await this.clearOfficeReminderLogs(id);
    return updated;
  }

  async deleteOfficeReminder(id: string) {
    await this.getOfficeReminderOrThrow(id);
    await this.clearOfficeReminderLogs(id);
    return this.prisma.officeReminder.delete({
      where: { id },
    });
  }

  async getOfficeReminderCalendarFile(id: string) {
    const reminder = await this.getOfficeReminderOrThrow(id);
    return {
      filename: `erinnerung-${id}.ics`,
      content: this.renderCalendarIcs(reminder),
    };
  }

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

  async runReminders(config?: ReminderConfig) {
    const cfg = config ?? (await this.getConfig());
    const results: string[] = [];

    const officeCount = await this.runOfficeReminderQueue();
    results.push(`Aufgaben/Wiedervorlagen: ${officeCount} Erinnerungen`);

    if (cfg.openSignatures) {
      const count = await this.remindOpenSignatures(cfg);
      results.push(`Offene Signaturen: ${count} Erinnerungen`);
    }

    if (cfg.openApprovals) {
      const count = await this.remindOpenApprovals();
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

  private async runOfficeReminderQueue(): Promise<number> {
    const reminders = await this.prisma.officeReminder.findMany({
      where: {
        status: OfficeReminderStatus.OPEN,
        remindAt: { lte: new Date() },
      },
      include: this.officeReminderInclude,
      orderBy: { remindAt: 'asc' },
    });

    let sentCount = 0;
    for (const reminder of reminders) {
      sentCount += await this.dispatchOfficeReminder(reminder);
    }
    return sentCount;
  }

  private async dispatchOfficeReminder(
    reminder: Awaited<ReturnType<typeof this.getOfficeReminderOrThrow>>,
  ) {
    const { linkType, linkId } = this.resolveReminderLink(reminder);
    const title = reminder.title;
    const body = this.buildReminderMessage(reminder);
    let sentCount = 0;

    for (const channel of reminder.channels) {
      const recipientId = this.resolveRecipientIdForChannel(reminder, channel);
      if (!recipientId) {
        await this.logOfficeReminderDispatch(
          reminder.id,
          channel,
          `${reminder.assignedUserId}:${channel}`,
          'FAILED',
        );
        continue;
      }

      if (
        await this.wasOfficeReminderChannelSent(reminder.id, channel, recipientId)
      ) {
        continue;
      }

      let delivered = false;
      if (channel === 'IN_APP') {
        await this.notifications.notifyUser(
          reminder.assignedUserId,
          'REMINDER',
          title,
          body,
          linkType,
          linkId,
        );
        delivered = true;
      } else if (channel === 'EMAIL') {
        delivered = await this.sendEmail(
          reminder.assignedUser.email,
          title,
          body,
          reminder.id,
          channel,
          recipientId,
        );
      } else if (channel === 'SMS') {
        delivered = await this.sendSms(
          reminder.smsNumber,
          `${title}: ${body}`,
          reminder.id,
          recipientId,
        );
      } else if (channel === 'CALENDAR') {
        delivered = await this.sendEmail(
          reminder.assignedUser.email,
          `${title} (Kalendereintrag)`,
          body,
          reminder.id,
          channel,
          recipientId,
          [
            {
              filename: `erinnerung-${reminder.id}.ics`,
              content: this.renderCalendarIcs(reminder),
              contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
            },
          ],
        );
      }

      await this.logOfficeReminderDispatch(
        reminder.id,
        channel,
        recipientId,
        delivered ? 'SENT' : 'FAILED',
      );
      if (delivered) {
        sentCount += 1;
      }
    }

    return sentCount;
  }

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
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        project: { select: { projectNumber: true, title: true } },
      },
    });

    let count = 0;
    for (const sheet of sheets) {
      const entityId = sheet.id;
      const type =
        sheet.status === 'DRAFT' ? 'OPEN_WORKER_SIGN' : 'OPEN_CUSTOMER_SIGN';

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
        await this.sendEmail(sheet.worker.email, title, body);
      }

      await this.logSent(type, entityId, sheet.workerId);
      count++;
    }
    return count;
  }

  private async remindOpenApprovals(): Promise<number> {
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
      if (await this.alreadySent('OPEN_APPROVAL', sheet.id, 'admins')) continue;

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

    const docs = await this.prisma.document.findMany({
      where: { approvalStatus: 'SUBMITTED' },
      select: { id: true, title: true, originalFilename: true },
    });

    for (const doc of docs) {
      if (await this.alreadySent('OPEN_DOC_APPROVAL', doc.id, 'admins')) {
        continue;
      }

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
        worker: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        project: { select: { id: true, projectNumber: true, title: true } },
      },
    });

    let count = 0;
    for (const a of assignments) {
      if (await this.alreadySent('PROJECT_START', a.id, a.workerId)) continue;

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
        await this.sendEmail(a.worker.email, title, body);
      }

      await this.logSent('PROJECT_START', a.id, a.workerId);
      count++;
    }
    return count;
  }

  private async remindMissingTime(cfg: ReminderConfig): Promise<number> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        active: true,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: yesterday } }],
      },
      include: {
        worker: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
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

        await this.notifications.notifyWorker(wid, 'MISSING_TIME', title, body);

        if (cfg.emailEnabled && worker?.email) {
          await this.sendEmail(worker.email, title, body);
        }

        await this.logSent('MISSING_TIME', dayKey, wid);
        count++;
      }
    }
    return count;
  }

  private async getOfficeReminderOrThrow(id: string) {
    const reminder = await this.prisma.officeReminder.findUnique({
      where: { id },
      include: this.officeReminderInclude,
    });
    if (!reminder) {
      throw new NotFoundException('Erinnerung nicht gefunden.');
    }
    return reminder;
  }

  private parseReminderStatus(value?: string, required = true) {
    if (!value) {
      if (required) {
        throw new BadRequestException('Status fehlt.');
      }
      return undefined;
    }
    if (
      value === OfficeReminderStatus.OPEN ||
      value === OfficeReminderStatus.COMPLETED ||
      value === OfficeReminderStatus.CANCELED
    ) {
      return value;
    }
    throw new BadRequestException('Ungueltiger Status.');
  }

  private parseReminderKind(value?: string) {
    if (!value || value === OfficeReminderKind.TODO) {
      return OfficeReminderKind.TODO;
    }
    if (value === OfficeReminderKind.CALLBACK) {
      return OfficeReminderKind.CALLBACK;
    }
    if (value === OfficeReminderKind.FOLLOW_UP) {
      return OfficeReminderKind.FOLLOW_UP;
    }
    throw new BadRequestException('Ungueltige Aufgabenart.');
  }

  private parseDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Ungueltiges Datum.');
    }
    return date;
  }

  private normalizeChannels(channels?: string[]) {
    const normalized = [...new Set((channels ?? []).map((channel) => channel.toUpperCase()))];
    if (normalized.length === 0) {
      throw new BadRequestException('Mindestens ein Kanal ist erforderlich.');
    }
    for (const channel of normalized) {
      if (!OFFICE_CHANNELS.includes(channel as (typeof OFFICE_CHANNELS)[number])) {
        throw new BadRequestException('Ungueltiger Erinnerungskanal.');
      }
    }
    return normalized;
  }

  private async normalizeOfficeReminderInput(dto: OfficeReminderInput) {
    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException('Titel ist erforderlich.');
    }
    if (!dto.assignedUserId) {
      throw new BadRequestException('Verantwortlicher Benutzer fehlt.');
    }

    await this.assertOfficeUser(dto.assignedUserId);

    const remindAt = this.parseDate(dto.remindAt);
    if (!remindAt) {
      throw new BadRequestException('Erinnerungszeitpunkt ist erforderlich.');
    }
    const dueAt = this.parseDate(dto.dueAt);
    const channels = this.normalizeChannels(dto.channels);
    const smsNumber = dto.smsNumber?.trim() || null;
    if (channels.includes('SMS') && !smsNumber) {
      throw new BadRequestException('Fuer SMS ist eine Rufnummer erforderlich.');
    }

    const resolved = await this.resolveReminderLinks(dto);

    return {
      title,
      description: dto.description?.trim() || null,
      kind: this.parseReminderKind(dto.kind),
      dueAt,
      remindAt,
      channels,
      smsNumber,
      assignedUserId: dto.assignedUserId,
      customerId: resolved.customerId,
      contactId: resolved.contactId,
      projectId: resolved.projectId,
      noteId: resolved.noteId,
    };
  }

  private async resolveReminderLinks(dto: OfficeReminderInput) {
    let customerId = dto.customerId ?? null;
    let contactId = dto.contactId ?? null;
    let projectId = dto.projectId ?? null;
    let noteId = dto.noteId ?? null;

    if (contactId) {
      const contact = await this.prisma.customerContact.findUnique({
        where: { id: contactId },
        select: { id: true, customerId: true },
      });
      if (!contact) {
        throw new BadRequestException('Ansprechpartner nicht gefunden.');
      }
      customerId = contact.customerId;
    }

    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true, customerId: true },
      });
      if (!project) {
        throw new BadRequestException('Projekt nicht gefunden.');
      }
      customerId = project.customerId;
    }

    if (noteId) {
      const note = await this.prisma.note.findUnique({
        where: { id: noteId },
        select: {
          id: true,
          customerId: true,
          contactId: true,
          projectId: true,
        },
      });
      if (!note) {
        throw new BadRequestException('Notiz nicht gefunden.');
      }
      customerId = note.customerId ?? customerId;
      contactId = note.contactId ?? contactId;
      projectId = note.projectId ?? projectId;
    }

    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException('Kunde nicht gefunden.');
      }
    }

    return { customerId, contactId, projectId, noteId };
  }

  private async assertOfficeUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        roles: {
          some: {
            role: {
              code: { in: [RoleCode.SUPERADMIN, RoleCode.OFFICE] },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        'Der verantwortliche Benutzer muss ein aktiver Buero-Benutzer sein.',
      );
    }
  }

  private buildReminderMessage(
    reminder: Awaited<ReturnType<typeof this.getOfficeReminderOrThrow>>,
  ) {
    const parts: string[] = [];
    if (reminder.description) {
      parts.push(reminder.description);
    }
    parts.push(`Erinnerung: ${reminder.remindAt.toLocaleString('de-DE')}`);
    if (reminder.dueAt) {
      parts.push(`Faellig bis: ${reminder.dueAt.toLocaleString('de-DE')}`);
    }
    const context = this.buildReminderContext(reminder);
    if (context) {
      parts.push(`Bezug: ${context}`);
    }
    return parts.join('\n');
  }

  private buildReminderContext(
    reminder: Awaited<ReturnType<typeof this.getOfficeReminderOrThrow>>,
  ) {
    const parts: string[] = [];
    if (reminder.customer) {
      parts.push(
        `${reminder.customer.customerNumber} - ${reminder.customer.companyName}`,
      );
    }
    if (reminder.contact) {
      parts.push(`${reminder.contact.firstName} ${reminder.contact.lastName}`);
    }
    if (reminder.project) {
      parts.push(`${reminder.project.projectNumber} - ${reminder.project.title}`);
    }
    if (reminder.note) {
      parts.push(
        `Notiz: ${reminder.note.title?.trim() || reminder.note.content.slice(0, 40)}`,
      );
    }
    return parts.join(' | ');
  }

  private resolveReminderLink(
    reminder: Awaited<ReturnType<typeof this.getOfficeReminderOrThrow>>,
  ) {
    if (reminder.projectId) {
      return { linkType: 'PROJECT', linkId: reminder.projectId };
    }
    if (reminder.customerId) {
      return { linkType: 'CUSTOMER', linkId: reminder.customerId };
    }
    if (reminder.contact?.customer?.id) {
      return { linkType: 'CUSTOMER', linkId: reminder.contact.customer.id };
    }
    return { linkType: undefined, linkId: undefined };
  }

  private resolveRecipientIdForChannel(
    reminder: Awaited<ReturnType<typeof this.getOfficeReminderOrThrow>>,
    channel: string,
  ) {
    if (channel === 'IN_APP') {
      return reminder.assignedUserId;
    }
    if (channel === 'EMAIL' || channel === 'CALENDAR') {
      return reminder.assignedUser.email || null;
    }
    if (channel === 'SMS') {
      return reminder.smsNumber || null;
    }
    return null;
  }

  private renderCalendarIcs(
    reminder: Awaited<ReturnType<typeof this.getOfficeReminderOrThrow>>,
  ) {
    const start = reminder.remindAt;
    const end = reminder.dueAt
      ? reminder.dueAt
      : new Date(reminder.remindAt.getTime() + 30 * 60 * 1000);
    const description = this.escapeIcsText(this.buildReminderMessage(reminder));
    const summary = this.escapeIcsText(reminder.title);
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CRM//OfficeReminder//DE',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${reminder.id}@crm-office-reminder`,
      `DTSTAMP:${this.toIcsDate(new Date())}`,
      `DTSTART:${this.toIcsDate(start)}`,
      `DTEND:${this.toIcsDate(end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
  }

  private toIcsDate(date: Date) {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }

  private escapeIcsText(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  private async wasOfficeReminderChannelSent(
    entityId: string,
    channel: string,
    recipientId: string,
  ) {
    const existing = await this.prisma.reminderLog.findUnique({
      where: {
        type_entityId_channel_recipientId: {
          type: OFFICE_REMINDER_TYPE,
          entityId,
          channel,
          recipientId,
        },
      },
    });
    return existing?.status === 'SENT';
  }

  private async clearOfficeReminderLogs(entityId: string) {
    await this.prisma.reminderLog.deleteMany({
      where: {
        type: OFFICE_REMINDER_TYPE,
        entityId,
      },
    });
  }

  private async logOfficeReminderDispatch(
    entityId: string,
    channel: string,
    recipientId: string,
    status: string,
  ) {
    await this.prisma.reminderLog.upsert({
      where: {
        type_entityId_channel_recipientId: {
          type: OFFICE_REMINDER_TYPE,
          entityId,
          channel,
          recipientId,
        },
      },
      update: { sentAt: new Date(), status },
      create: {
        type: OFFICE_REMINDER_TYPE,
        entityId,
        channel,
        recipientId,
        status,
      },
    });
  }

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

  private async logSent(type: string, entityId: string, recipientId: string) {
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

  private async sendEmail(
    to: string | null | undefined,
    subject: string,
    body: string,
    entityId?: string,
    channel = 'EMAIL',
    recipientId?: string,
    attachments?: Array<{
      filename: string;
      content: string;
      contentType?: string;
    }>,
  ) {
    if (!to) return false;

    try {
      const smtp = await this.prisma.smtpConfig.findFirst();
      if (!smtp?.host) return false;

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
        html: `<div style="font-family:sans-serif;font-size:14px;white-space:pre-line"><h2>${subject}</h2><p>${body}</p><hr/><p style="font-size:12px;color:#888">Diese E-Mail wurde automatisch vom CRM-System gesendet.</p></div>`,
        attachments,
      });

      if (entityId && recipientId) {
        await this.logOfficeReminderDispatch(entityId, channel, recipientId, 'SENT');
      }
      return true;
    } catch (error) {
      this.logger.warn(`E-Mail an ${to} fehlgeschlagen: ${error}`);
      return false;
    }
  }

  private async sendSms(
    to: string | null | undefined,
    body: string,
    entityId: string,
    recipientId: string,
  ) {
    if (!to) return false;

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      this.logger.warn('SMS nicht gesendet: Twilio-Konfiguration fehlt.');
      return false;
    }

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: to,
            From: from,
            Body: body,
          }),
        },
      );

      if (!response.ok) {
        const raw = await response.text();
        this.logger.warn(`SMS an ${to} fehlgeschlagen: ${raw}`);
        await this.logOfficeReminderDispatch(entityId, 'SMS', recipientId, 'FAILED');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.warn(`SMS an ${to} fehlgeschlagen: ${error}`);
      await this.logOfficeReminderDispatch(entityId, 'SMS', recipientId, 'FAILED');
      return false;
    }
  }
}
