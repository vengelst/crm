import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateTimesheetDto } from './dto/generate-timesheet.dto';
import { SendTimesheetEmailDto } from './dto/send-timesheet-email.dto';
import { SignTimesheetDto } from './dto/sign-timesheet.dto';
import { SignerType, WeeklyTimesheetStatus } from '@prisma/client';
import { createTransport } from 'nodemailer';

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(workerId?: string, projectId?: string) {
    return this.prisma.weeklyTimesheet.findMany({
      where: {
        workerId: workerId || undefined,
        projectId: projectId || undefined,
      },
      include: {
        worker: true,
        project: true,
        days: true,
        signatures: true,
      },
      orderBy: [{ weekYear: 'desc' }, { weekNumber: 'desc' }],
    });
  }

  async getById(id: string) {
    const sheet = await this.prisma.weeklyTimesheet.findUnique({
      where: { id },
      include: {
        worker: true,
        project: {
          include: {
            customer: true,
          },
        },
        days: {
          orderBy: {
            workDate: 'asc',
          },
        },
        signatures: true,
      },
    });

    if (!sheet) {
      throw new NotFoundException('Wochenzettel nicht gefunden.');
    }

    return sheet;
  }

  async generate(dto: GenerateTimesheetDto) {
    const range = getIsoWeekRange(dto.weekYear, dto.weekNumber);
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      include: {
        pauseRule: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Projekt nicht gefunden.');
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        workerId: dto.workerId,
        projectId: dto.projectId,
        occurredAtServer: {
          gte: range.start,
          lte: range.end,
        },
      },
      orderBy: {
        occurredAtServer: 'asc',
      },
    });

    const groupedByDay = new Map<string, typeof entries>();

    for (const entry of entries) {
      const key = entry.occurredAtServer.toISOString().slice(0, 10);
      const current = groupedByDay.get(key) ?? [];
      current.push(entry);
      groupedByDay.set(key, current);
    }

    const days = Array.from(groupedByDay.entries()).map(([workDate, items]) => {
      const clockIns = items.filter((item) => item.entryType === 'CLOCK_IN');
      const clockOuts = items.filter((item) => item.entryType === 'CLOCK_OUT');
      const firstClockIn = clockIns[0];
      const lastClockOut = clockOuts[clockOuts.length - 1];

      if (!firstClockIn || !lastClockOut) {
        return {
          workDate: new Date(workDate),
          firstClockInAt: firstClockIn?.occurredAtServer,
          lastClockOutAt: lastClockOut?.occurredAtServer,
          grossMinutes: 0,
          breakMinutes: 0,
          netMinutes: 0,
          summaryComment: 'Unvollstaendige Buchung',
          clockInLatitude: firstClockIn?.latitude,
          clockInLongitude: firstClockIn?.longitude,
          clockOutLatitude: lastClockOut?.latitude,
          clockOutLongitude: lastClockOut?.longitude,
        };
      }

      const grossMinutes = Math.max(
        0,
        Math.round(
          (lastClockOut.occurredAtServer.getTime() -
            firstClockIn.occurredAtServer.getTime()) /
            60000,
        ),
      );
      const breakMinutes = calculateBreakMinutes(
        grossMinutes,
        project.pauseRule,
      );
      const netMinutes = Math.max(0, grossMinutes - breakMinutes);

      return {
        workDate: new Date(workDate),
        firstClockInAt: firstClockIn.occurredAtServer,
        lastClockOutAt: lastClockOut.occurredAtServer,
        grossMinutes,
        breakMinutes,
        netMinutes,
        summaryComment: null,
        clockInLatitude: firstClockIn.latitude,
        clockInLongitude: firstClockIn.longitude,
        clockOutLatitude: lastClockOut.latitude,
        clockOutLongitude: lastClockOut.longitude,
      };
    });

    const totals = days.reduce(
      (acc, day) => {
        acc.totalMinutesGross += day.grossMinutes;
        acc.totalBreakMinutes += day.breakMinutes;
        acc.totalMinutesNet += day.netMinutes;
        return acc;
      },
      {
        totalMinutesGross: 0,
        totalBreakMinutes: 0,
        totalMinutesNet: 0,
      },
    );

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.weeklyTimesheet.findUnique({
        where: {
          workerId_projectId_weekYear_weekNumber: {
            workerId: dto.workerId,
            projectId: dto.projectId,
            weekYear: dto.weekYear,
            weekNumber: dto.weekNumber,
          },
        },
      });

      const sheet = existing
        ? await tx.weeklyTimesheet.update({
            where: { id: existing.id },
            data: {
              status: WeeklyTimesheetStatus.DRAFT,
              totalMinutesGross: totals.totalMinutesGross,
              totalBreakMinutes: totals.totalBreakMinutes,
              totalMinutesNet: totals.totalMinutesNet,
              generatedAt: new Date(),
              lockedAt: null,
            },
          })
        : await tx.weeklyTimesheet.create({
            data: {
              workerId: dto.workerId,
              projectId: dto.projectId,
              weekYear: dto.weekYear,
              weekNumber: dto.weekNumber,
              totalMinutesGross: totals.totalMinutesGross,
              totalBreakMinutes: totals.totalBreakMinutes,
              totalMinutesNet: totals.totalMinutesNet,
            },
          });

      await tx.weeklyTimesheetDay.deleteMany({
        where: {
          weeklyTimesheetId: sheet.id,
        },
      });

      if (days.length > 0) {
        await tx.weeklyTimesheetDay.createMany({
          data: days.map((day) => ({
            weeklyTimesheetId: sheet.id,
            workDate: day.workDate,
            firstClockInAt: day.firstClockInAt,
            lastClockOutAt: day.lastClockOutAt,
            grossMinutes: day.grossMinutes,
            breakMinutes: day.breakMinutes,
            netMinutes: day.netMinutes,
            summaryComment: day.summaryComment,
            clockInLatitude: day.clockInLatitude,
            clockInLongitude: day.clockInLongitude,
            clockOutLatitude: day.clockOutLatitude,
            clockOutLongitude: day.clockOutLongitude,
          })),
        });
      }

      return tx.weeklyTimesheet.findUniqueOrThrow({
        where: { id: sheet.id },
        include: {
          worker: true,
          project: true,
          days: true,
          signatures: true,
        },
      });
    });
  }

  async signWorker(id: string, dto: SignTimesheetDto, ipAddress?: string) {
    return this.sign(
      id,
      SignerType.WORKER,
      WeeklyTimesheetStatus.WORKER_SIGNED,
      dto,
      ipAddress,
    );
  }

  async signCustomer(id: string, dto: SignTimesheetDto, ipAddress?: string) {
    return this.sign(
      id,
      SignerType.CUSTOMER,
      WeeklyTimesheetStatus.CUSTOMER_SIGNED,
      dto,
      ipAddress,
    );
  }

  async renderPdf(id: string) {
    const sheet = await this.getById(id);

    // Lade Firmen- und PDF-Einstellungen
    const companyRows = await this.prisma.setting.findMany({
      where: { key: { startsWith: 'company.' } },
    });
    const company: Record<string, string> = {};
    for (const row of companyRows) {
      const val = row.valueJson;
      company[row.key.slice(8)] = typeof val === 'string' ? val : '';
    }

    const pdfRows = await this.prisma.setting.findMany({
      where: { key: { startsWith: 'pdf.' } },
    });
    const pdfRaw: Record<string, unknown> = {};
    for (const row of pdfRows) {
      pdfRaw[row.key.slice(4)] = row.valueJson;
    }
    const pdfCfg = {
      header: typeof pdfRaw.header === 'string' ? pdfRaw.header : '',
      footer: typeof pdfRaw.footer === 'string' ? pdfRaw.footer : '',
      extraText: typeof pdfRaw.extraText === 'string' ? pdfRaw.extraText : '',
      useLogo: pdfRaw.useLogo === true,
    };

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 595.28;
    const margin = 40;

    let y = 800;

    const text = (str: string, x: number, size: number, f = font) => {
      page.drawText(str, { x, y, size, font: f });
    };

    const hLine = () => {
      page.drawLine({
        start: { x: margin, y: y + 4 },
        end: { x: pageWidth - margin, y: y + 4 },
        thickness: 0.5,
      });
    };

    // ── Kopfzeile ──────────────────────────────────
    if (pdfCfg.header) {
      text(String(pdfCfg.header), margin, 8);
      y -= 14;
    }

    // ── Titel ──────────────────────────────────────
    text('Wochen-Stundenzettel', margin, 18, boldFont);
    y -= 8;
    text(`KW ${sheet.weekNumber} / ${sheet.weekYear}`, margin + 250, 12);
    y -= 26;
    hLine();
    y -= 16;

    // ── Firma ──────────────────────────────────────
    if (company.name) {
      text('Auftraggeber', margin, 9, boldFont);
      text('Kunde', pageWidth / 2, 9, boldFont);
      y -= 14;
      text(company.name, margin, 10);
      text(
        (sheet.project as { customer?: { companyName?: string } }).customer
          ?.companyName ?? '-',
        pageWidth / 2,
        10,
      );
      y -= 13;
      if (company.street) {
        text(company.street, margin, 9);
        y -= 12;
      }
      const cityLine = [company.postalCode, company.city]
        .filter(Boolean)
        .join(' ');
      if (cityLine) {
        text(cityLine, margin, 9);
        y -= 12;
      }
      if (company.phone) {
        text(`Tel: ${company.phone}`, margin, 9);
        y -= 12;
      }
      y -= 8;
      hLine();
      y -= 16;
    }

    // ── Projekt / Monteur ──────────────────────────
    text('Projekt', margin, 9, boldFont);
    text('Monteur', pageWidth / 2, 9, boldFont);
    y -= 14;
    text(`${sheet.project.projectNumber} - ${sheet.project.title}`, margin, 10);
    text(
      `${sheet.worker.firstName} ${sheet.worker.lastName}`,
      pageWidth / 2,
      10,
    );
    y -= 13;

    const siteAddr = [
      sheet.project.siteAddressLine1,
      sheet.project.sitePostalCode,
      sheet.project.siteCity,
    ]
      .filter(Boolean)
      .join(', ');
    if (siteAddr) {
      text(`Ort: ${siteAddr}`, margin, 9);
      y -= 12;
    }
    y -= 8;
    hLine();
    y -= 16;

    // ── Tagesübersicht Tabelle ─────────────────────
    text('Tagesuebersicht', margin, 12, boldFont);
    y -= 18;

    // Tabellenkopf
    const cols = [margin, 120, 190, 260, 340, 420];
    const headers = ['Datum', 'Beginn', 'Ende', 'Brutto', 'Pause', 'Netto'];
    for (let i = 0; i < headers.length; i++) {
      text(headers[i], cols[i], 9, boldFont);
    }
    y -= 14;
    hLine();
    y -= 12;

    for (const day of sheet.days) {
      const workDate = day.workDate.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });
      text(workDate, cols[0], 9);
      text(formatTime(day.firstClockInAt), cols[1], 9);
      text(formatTime(day.lastClockOutAt), cols[2], 9);
      text(fmtMinutes(day.grossMinutes), cols[3], 9);
      text(fmtMinutes(day.breakMinutes), cols[4], 9);
      text(fmtMinutes(day.netMinutes), cols[5], 9, boldFont);
      y -= 14;
    }

    // Summenzeile
    y -= 4;
    hLine();
    y -= 14;
    text('Summe', cols[0], 10, boldFont);
    text(fmtMinutes(sheet.totalMinutesGross), cols[3], 10, boldFont);
    text(fmtMinutes(sheet.totalBreakMinutes), cols[4], 10, boldFont);
    text(fmtMinutes(sheet.totalMinutesNet), cols[5], 10, boldFont);
    y -= 20;

    // ── Zusatztext ─────────────────────────────────
    if (pdfCfg.extraText) {
      text(String(pdfCfg.extraText), margin, 9);
      y -= 16;
    }

    // ── Signaturen ─────────────────────────────────
    hLine();
    y -= 16;
    text('Unterschriften', margin, 12, boldFont);
    y -= 18;

    const workerSig = sheet.signatures.find((s) => s.signerType === 'WORKER');
    const customerSig = sheet.signatures.find(
      (s) => s.signerType === 'CUSTOMER',
    );

    text('Monteur:', margin, 9, boldFont);
    text('Kunde:', pageWidth / 2, 9, boldFont);
    y -= 14;

    if (workerSig) {
      text(
        `${workerSig.signerName} (${workerSig.signedAt.toLocaleDateString('de-DE')})`,
        margin,
        9,
      );
    } else {
      text('________________________', margin, 9);
    }

    if (customerSig) {
      text(
        `${customerSig.signerName} (${customerSig.signedAt.toLocaleDateString('de-DE')})`,
        pageWidth / 2,
        9,
      );
    } else {
      text('________________________', pageWidth / 2, 9);
    }
    y -= 20;

    // ── Fusszeile ──────────────────────────────────
    if (pdfCfg.footer) {
      page.drawText(String(pdfCfg.footer), {
        x: margin,
        y: 30,
        size: 7,
        font,
      });
    }

    page.drawText(`Erstellt: ${new Date().toLocaleString('de-DE')}`, {
      x: pageWidth - 180,
      y: 30,
      size: 7,
      font,
    });

    return Buffer.from(await pdf.save());
  }

  async sendEmail(id: string, dto: SendTimesheetEmailDto) {
    const sheet = await this.getById(id);
    const pdf = await this.renderPdf(id);
    const subject =
      dto.subject ??
      `Wochenzettel KW ${sheet.weekNumber}/${sheet.weekYear} - ${sheet.project.title}`;
    const text =
      dto.message ??
      `Im Anhang befindet sich der Wochenzettel fuer ${sheet.worker.firstName} ${sheet.worker.lastName}.`;

    // SMTP-Konfiguration aus der Datenbank laden
    const smtpConfig = await this.prisma.smtpConfig.findFirst();

    let transport;
    let transportType: string;

    if (smtpConfig && smtpConfig.host) {
      // Gespeicherte SMTP-Konfiguration verwenden
      transport = createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth:
          smtpConfig.user && smtpConfig.password
            ? { user: smtpConfig.user, pass: smtpConfig.password }
            : undefined,
      });
      transportType = 'smtp';
    } else if (process.env.SMTP_HOST) {
      // Fallback: Env-Variablen
      transport = createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 25),
        secure: Number(process.env.SMTP_PORT ?? 25) === 465,
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
      });
      transportType = 'smtp-env';
    } else {
      // Kein SMTP konfiguriert → JSON-Transport (Logging)
      transport = createTransport({ jsonTransport: true });
      transportType = 'json';
    }

    const fromEmail =
      smtpConfig?.fromEmail || process.env.SMTP_FROM || 'crm@example.local';

    const result = await transport.sendMail({
      from: fromEmail,
      to: dto.recipients.join(', '),
      subject,
      text,
      attachments: [
        {
          filename: createPdfFilename(sheet.weekYear, sheet.weekNumber),
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });

    return {
      transport: transportType,
      recipients: dto.recipients,
      subject,
      messageId: result.messageId,
      envelope: result.envelope,
    };
  }

  private async sign(
    id: string,
    signerType: SignerType,
    nextStatus: WeeklyTimesheetStatus,
    dto: SignTimesheetDto,
    ipAddress?: string,
  ) {
    await this.getById(id);

    if (
      !dto.signatureImagePath.startsWith('data:image') &&
      !dto.signatureImagePath.startsWith('/')
    ) {
      throw new BadRequestException(
        'signatureImagePath muss ein Bildpfad oder Data-URL sein.',
      );
    }

    await this.prisma.weeklyTimesheetSignature.create({
      data: {
        weeklyTimesheetId: id,
        signerType,
        signerName: dto.signerName,
        signerRole: dto.signerRole,
        signatureImagePath: dto.signatureImagePath,
        ipAddress,
        deviceInfo: dto.deviceInfo,
      },
    });

    return this.prisma.weeklyTimesheet.update({
      where: { id },
      data: {
        status: nextStatus,
      },
      include: {
        days: true,
        signatures: true,
      },
    });
  }
}

function createPdfFilename(year: number, week: number) {
  return `wochenzettel-${year}-kw${String(week).padStart(2, '0')}.pdf`;
}

function fmtMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatTime(value: Date | null) {
  return value
    ? value.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
}

function calculateBreakMinutes(
  grossMinutes: number,
  pauseRule: {
    autoDeductEnabled: boolean;
    thresholdMinutes1: number;
    breakMinutes1: number;
    thresholdMinutes2: number | null;
    breakMinutes2: number | null;
  } | null,
) {
  if (!pauseRule?.autoDeductEnabled) {
    return 0;
  }

  if (
    pauseRule.thresholdMinutes2 &&
    pauseRule.breakMinutes2 &&
    grossMinutes >= pauseRule.thresholdMinutes2
  ) {
    return pauseRule.breakMinutes2;
  }

  if (grossMinutes >= pauseRule.thresholdMinutes1) {
    return pauseRule.breakMinutes1;
  }

  return 0;
}

function getIsoWeekRange(year: number, week: number) {
  const simple = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  return {
    start: monday,
    end: sunday,
  };
}
