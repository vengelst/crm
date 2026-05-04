import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { ProjectsService } from '../projects/projects.service';
import { RemindersService } from '../reminders/reminders.service';
import { DocumentsService } from '../documents/documents.service';
import { StorageService } from '../storage/storage.service';
import { type PrintEntityType, PrintBundleDto } from './dto/print-bundle.dto';
import { PdfBuilder } from './pdf-builder';

const ENTITY_PRINT_PERMISSION: Record<PrintEntityType, string> = {
  customer: 'customers.print',
  project: 'projects.print',
  reports: 'reports.print',
  tasks: 'tasks.print',
};

const DOCUMENT_PRINT_PERMISSION = 'documents.print';

/**
 * Build a single PDF bundle from a configured selection: base PDF rendered
 * from selected sections plus an optional appendix of selected documents
 * (PDF pages cloned, images embedded, other mime types skipped).
 */
@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly projects: ProjectsService,
    private readonly reminders: RemindersService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
  ) {}

  async buildBundle(
    dto: PrintBundleDto,
    userPermissions: string[],
  ): Promise<{ pdf: Buffer; filename: string; skippedDocuments: number }> {
    this.assertPermissions(dto, userPermissions);

    const builder = await PdfBuilder.create();
    let filename = `${dto.entityType}.pdf`;

    switch (dto.entityType) {
      case 'customer': {
        if (!dto.entityId) {
          throw new NotFoundException('entityId required for customer bundle.');
        }
        filename = await this.renderCustomer(
          builder,
          dto.entityId,
          dto.sections,
        );
        break;
      }
      case 'project': {
        if (!dto.entityId) {
          throw new NotFoundException('entityId required for project bundle.');
        }
        filename = await this.renderProject(
          builder,
          dto.entityId,
          dto.sections,
        );
        break;
      }
      case 'reports': {
        await this.renderReports(builder, dto.sections);
        filename = `reports-${todayStr()}.pdf`;
        break;
      }
      case 'tasks': {
        const fn = await this.renderTasks(builder, dto.entityId, dto.sections);
        filename = fn;
        break;
      }
    }

    let skipped = 0;
    if (dto.includeDocuments && dto.documentIds.length > 0) {
      skipped = await this.appendDocuments(builder, dto.documentIds);
    }

    const bytes = await builder.save();
    return {
      pdf: Buffer.from(bytes),
      filename,
      skippedDocuments: skipped,
    };
  }

  // ── Permissions ────────────────────────────────────────────

  private assertPermissions(dto: PrintBundleDto, perms: string[]): void {
    const required = ENTITY_PRINT_PERMISSION[dto.entityType];
    if (!perms.includes(required)) {
      throw new ForbiddenException(`Fehlende Berechtigung: ${required}`);
    }
    if (dto.includeDocuments && dto.documentIds.length > 0) {
      if (!perms.includes(DOCUMENT_PRINT_PERMISSION)) {
        throw new ForbiddenException(
          `Fehlende Berechtigung: ${DOCUMENT_PRINT_PERMISSION}`,
        );
      }
    }
  }

  // ── Customer renderer ──────────────────────────────────────

  private async renderCustomer(
    pdf: PdfBuilder,
    customerId: string,
    sections: string[],
  ): Promise<string> {
    const customer = await this.customers.getById(customerId);
    pdf.title(customer.companyName);
    pdf.meta(
      `${customer.customerNumber}${customer.status ? ` · ${customer.status}` : ''}`,
    );
    pdf.spacer(4);

    if (sections.includes('masterData')) {
      pdf.heading('Stammdaten');
      pdf.grid([
        [
          'Adresse',
          formatAddress([
            customer.addressLine1,
            customer.addressLine2,
            customer.postalCode,
            customer.city,
            customer.country,
          ]),
        ],
        ['Telefon', customer.phone ?? '-'],
        ['E-Mail', customer.email ?? '-'],
        ['Website', customer.website ?? '-'],
        ['USt-ID', customer.vatId ?? '-'],
        ['Rechtsform', customer.legalForm ?? '-'],
        ['Rechnungs-E-Mail', customer.billingEmail ?? '-'],
      ]);
    }

    if (sections.includes('branches') && customer.branches.length > 0) {
      pdf.heading(`Niederlassungen (${customer.branches.length})`);
      pdf.table(
        ['Name', 'Adresse', 'Telefon', 'E-Mail'],
        customer.branches.map((b) => [
          b.name,
          formatAddress([b.addressLine1, b.postalCode, b.city]),
          b.phone ?? '-',
          b.email ?? '-',
        ]),
        [120, 230, 90, 75],
      );
    }

    if (sections.includes('contacts') && customer.contacts.length > 0) {
      pdf.heading(`Ansprechpartner (${customer.contacts.length})`);
      pdf.table(
        ['Name', 'Rolle', 'Mobil', 'E-Mail'],
        customer.contacts.map((c) => [
          `${c.firstName} ${c.lastName}`,
          c.role ?? '-',
          c.phoneMobile ?? '-',
          c.email ?? '-',
        ]),
        [120, 130, 100, 165],
      );
    }

    if (sections.includes('projects')) {
      const projects = await this.prisma.project.findMany({
        where: { customerId, deletedAt: null },
        orderBy: { projectNumber: 'asc' },
      });
      if (projects.length > 0) {
        pdf.heading(`Zugeordnete Projekte (${projects.length})`);
        pdf.table(
          ['Nr', 'Titel', 'Status'],
          projects.map((p) => [p.projectNumber, p.title, p.status ?? '-']),
          [80, 320, 115],
        );
      }
    }

    if (sections.includes('financials')) {
      try {
        const f = await this.customers.getFinancials(customerId);
        pdf.heading('Auswertung');
        pdf.grid([
          ['Stunden gesamt', `${f.totalHours} h`],
          ['Überstunden', `${f.overtimeHours} h`],
          ['Umsatz', `${f.totalRevenue.toFixed(2)} EUR`],
          ['Kosten', `${f.totalCosts.toFixed(2)} EUR`],
          ['Marge', `${f.margin.toFixed(2)} EUR`],
        ]);
      } catch (e) {
        this.logger.warn(
          `Financials skipped for customer ${customerId}: ${(e as Error).message}`,
        );
      }
    }

    if (sections.includes('notes') && customer.notes) {
      pdf.heading('Notizen');
      pdf.paragraph(customer.notes);
    }

    return `kunde-${customer.customerNumber}.pdf`;
  }

  // ── Project renderer ───────────────────────────────────────

  private async renderProject(
    pdf: PdfBuilder,
    projectId: string,
    sections: string[],
  ): Promise<string> {
    const project = await this.projects.getById(projectId);
    pdf.title(project.title);
    pdf.meta(
      `${project.projectNumber}${project.customer?.companyName ? ` · ${project.customer.companyName}` : ''}${project.status ? ` · ${project.status}` : ''}`,
    );
    pdf.spacer(4);

    if (sections.includes('masterData')) {
      pdf.heading('Projektdaten');
      pdf.grid([
        ['Kunde', project.customer?.companyName ?? '-'],
        [
          'Baustelle',
          formatAddress([
            project.siteAddressLine1,
            project.sitePostalCode,
            project.siteCity,
            project.siteCountry,
          ]),
        ],
        ['Status', project.status ?? '-'],
        ['Leistungsart', project.serviceType ?? '-'],
        [
          'Geplanter Start',
          project.plannedStartDate
            ? toDateString(project.plannedStartDate)
            : '-',
        ],
        [
          'Geplantes Ende',
          project.plannedEndDate ? toDateString(project.plannedEndDate) : '-',
        ],
      ]);
      if (project.description) {
        pdf.spacer(4);
        pdf.paragraph(project.description);
      }
    }

    if (sections.includes('pricing')) {
      const hasAny =
        project.weeklyFlatRate != null ||
        project.hourlyRateUpTo40h != null ||
        project.includedHoursPerWeek != null ||
        project.overtimeRate != null;
      if (hasAny) {
        pdf.heading('Projektpreise');
        pdf.grid([
          [
            'Wochenpauschale',
            project.weeklyFlatRate != null
              ? `${project.weeklyFlatRate.toFixed(2)} EUR`
              : '-',
          ],
          [
            'Inkl. Stunden / Woche',
            project.includedHoursPerWeek != null
              ? `${project.includedHoursPerWeek} h`
              : '-',
          ],
          [
            'Stundensatz bis 40h',
            project.hourlyRateUpTo40h != null
              ? `${project.hourlyRateUpTo40h.toFixed(2)} EUR`
              : '-',
          ],
          [
            'Überstundensatz',
            project.overtimeRate != null
              ? `${project.overtimeRate.toFixed(2)} EUR`
              : '-',
          ],
        ]);
      }
    }

    if (sections.includes('workers')) {
      const assignments = (project.assignments ?? []) as Array<{
        worker: {
          firstName: string;
          lastName: string;
          workerNumber: string;
          internalHourlyRate?: number | null;
        };
      }>;
      if (assignments.length > 0) {
        pdf.heading(`Eingeteilte Monteure (${assignments.length})`);
        pdf.table(
          ['Name', 'Nummer', 'Stundensatz'],
          assignments.map((a) => [
            `${a.worker.firstName} ${a.worker.lastName}`,
            a.worker.workerNumber,
            a.worker.internalHourlyRate != null
              ? `${a.worker.internalHourlyRate.toFixed(2)} EUR/h`
              : '-',
          ]),
          [220, 130, 165],
        );
      }
    }

    if (sections.includes('financials')) {
      try {
        const f = await this.projects.getFinancials(projectId);
        pdf.heading('Auswertung');
        pdf.grid([
          ['Stunden gesamt', `${f.totalHours} h`],
          ['Überstunden', `${f.overtimeHours} h`],
          ['Umsatz', `${f.totalRevenue.toFixed(2)} EUR`],
          ['Kosten', `${f.totalCosts.toFixed(2)} EUR`],
          ['Marge', `${f.margin.toFixed(2)} EUR`],
        ]);
      } catch (e) {
        this.logger.warn(
          `Financials skipped for project ${projectId}: ${(e as Error).message}`,
        );
      }
    }

    if (sections.includes('timesheets')) {
      const sheets = await this.prisma.weeklyTimesheet.findMany({
        where: { projectId },
        include: { worker: true },
        orderBy: [{ weekYear: 'desc' }, { weekNumber: 'desc' }],
        take: 50,
      });
      if (sheets.length > 0) {
        pdf.heading(`Stundenzettel (${sheets.length})`);
        pdf.table(
          ['KW', 'Monteur', 'Status', 'Stunden netto'],
          sheets.map((s) => [
            `${s.weekYear}-W${String(s.weekNumber).padStart(2, '0')}`,
            s.worker ? `${s.worker.firstName} ${s.worker.lastName}` : '-',
            s.status,
            (s.totalMinutesNet / 60).toFixed(2),
          ]),
          [80, 200, 130, 105],
        );
      }
    }

    if (sections.includes('notices')) {
      if (project.notes) {
        pdf.heading('Notizen');
        pdf.paragraph(project.notes);
      }
      const notices = await this.prisma.projectNotice.findMany({
        where: { projectId, active: true },
        orderBy: { sortOrder: 'asc' },
      });
      if (notices.length > 0) {
        pdf.heading(`Baustellenhinweise (${notices.length})`);
        for (const n of notices) {
          pdf.paragraph(`• ${n.title}`);
          if (n.body) pdf.paragraph(n.body);
          pdf.spacer(4);
        }
      }
    }

    return `projekt-${project.projectNumber}.pdf`;
  }

  // ── Reports renderer ───────────────────────────────────────

  private async renderReports(
    pdf: PdfBuilder,
    sections: string[],
  ): Promise<void> {
    pdf.title('Auswertung');
    pdf.meta(new Date().toLocaleString('de-DE'));
    pdf.spacer(4);

    if (sections.includes('kpis')) {
      const [activeWorkers, customers, activeProjects] = await Promise.all([
        this.prisma.worker.count({ where: { active: true } }),
        this.prisma.customer.count({ where: { deletedAt: null } }),
        this.prisma.project.count({
          where: { deletedAt: null, status: 'ACTIVE' },
        }),
      ]);
      pdf.heading('Kennzahlen');
      pdf.grid([
        ['Aktive Monteure', String(activeWorkers)],
        ['Aktive Projekte', String(activeProjects)],
        ['Kunden gesamt', String(customers)],
      ]);
    }

    if (sections.includes('revenuePerCustomer')) {
      const customers = await this.prisma.customer.findMany({
        where: { deletedAt: null },
        orderBy: { companyName: 'asc' },
        take: 200,
      });
      const rows: string[][] = [];
      for (const c of customers) {
        try {
          const f = await this.customers.getFinancials(c.id);
          rows.push([
            c.companyName,
            c.customerNumber,
            `${f.totalHours} h`,
            `${f.totalRevenue.toFixed(2)}`,
            `${f.totalCosts.toFixed(2)}`,
            `${f.margin.toFixed(2)}`,
          ]);
        } catch {
          rows.push([c.companyName, c.customerNumber, '-', '-', '-', '-']);
        }
      }
      pdf.heading('Umsatz pro Kunde');
      pdf.table(
        ['Kunde', 'Nr.', 'Std.', 'Umsatz', 'Kosten', 'Marge'],
        rows,
        [180, 70, 50, 80, 80, 55],
      );
    }

    if (sections.includes('workerStatus')) {
      const workers = await this.prisma.worker.findMany({
        where: { active: true },
        include: {
          assignments: { where: { active: true } },
          timeEntries: {
            orderBy: { occurredAtClient: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ lastName: 'asc' }],
      });
      pdf.heading(`Monteur-Status (${workers.length})`);
      pdf.table(
        ['Name', 'Nummer', 'Status'],
        workers.map((w) => {
          const isWorking = w.timeEntries[0]?.entryType === 'CLOCK_IN';
          const hasProject = w.assignments.length > 0;
          const status = isWorking
            ? 'Arbeitet'
            : hasProject
              ? 'Nicht gestartet'
              : 'Kein Projekt';
          return [`${w.firstName} ${w.lastName}`, w.workerNumber, status];
        }),
        [240, 130, 145],
      );
    }

    if (sections.includes('timesheets')) {
      const sheets = await this.prisma.weeklyTimesheet.findMany({
        include: {
          worker: true,
          project: true,
        },
        orderBy: [{ weekYear: 'desc' }, { weekNumber: 'desc' }],
        take: 100,
      });
      if (sheets.length > 0) {
        pdf.heading(`Stundenzettel (letzte ${sheets.length})`);
        pdf.table(
          ['KW', 'Projekt', 'Monteur', 'Status', 'Std netto'],
          sheets.map((s) => [
            `${s.weekYear}-W${String(s.weekNumber).padStart(2, '0')}`,
            `${s.project.projectNumber} ${s.project.title}`,
            s.worker ? `${s.worker.firstName} ${s.worker.lastName}` : '-',
            s.status,
            (s.totalMinutesNet / 60).toFixed(2),
          ]),
          [70, 180, 130, 90, 45],
        );
      }
    }
  }

  // ── Tasks renderer ─────────────────────────────────────────

  private async renderTasks(
    pdf: PdfBuilder,
    entityId: string | undefined,
    sections: string[],
  ): Promise<string> {
    if (entityId) {
      // Single-task mode.
      const item = await this.prisma.officeReminder.findUnique({
        where: { id: entityId },
        include: {
          assignedUser: { select: { displayName: true, email: true } },
          createdBy: { select: { displayName: true, email: true } },
          customer: { select: { companyName: true, customerNumber: true } },
          contact: { select: { firstName: true, lastName: true } },
          project: { select: { projectNumber: true, title: true } },
        },
      });
      if (!item) {
        throw new NotFoundException(`Aufgabe ${entityId} nicht gefunden.`);
      }
      pdf.title(item.title);
      pdf.meta(
        `${item.kind} · ${item.status} · ${new Date(item.remindAt).toLocaleString('de-DE')}`,
      );
      if (sections.includes('taskDetail')) {
        pdf.heading('Aufgaben-Details');
        pdf.grid([
          ['Status', item.status],
          ['Art', item.kind],
          ['Zugewiesen an', item.assignedUser?.displayName ?? '-'],
          ['Erinnerung', new Date(item.remindAt).toLocaleString('de-DE')],
          [
            'Fällig',
            item.dueAt ? new Date(item.dueAt).toLocaleString('de-DE') : '-',
          ],
          ['Erstellt von', item.createdBy?.displayName ?? '-'],
          ['Kanäle', item.channels.join(', ')],
          [
            'Kunde',
            item.customer
              ? `${item.customer.companyName} (${item.customer.customerNumber})`
              : '-',
          ],
          [
            'Kontakt',
            item.contact
              ? `${item.contact.firstName} ${item.contact.lastName}`
              : '-',
          ],
          [
            'Projekt',
            item.project
              ? `${item.project.projectNumber} ${item.project.title}`
              : '-',
          ],
        ]);
        if (item.description) {
          pdf.spacer(4);
          pdf.paragraph(item.description);
        }
      }
      return `aufgabe-${item.id.slice(0, 8)}.pdf`;
    }

    // List mode.
    const all = await this.reminders.listOfficeReminders();
    pdf.title('Aufgaben');
    pdf.meta(new Date().toLocaleString('de-DE'));
    pdf.spacer(4);

    if (sections.includes('filters')) {
      pdf.heading('Aktive Filter');
      pdf.paragraph('Alle Aufgaben (kein Filter aus dem UI übernommen).');
    }

    const open = all.filter((i) => i.status === 'OPEN');
    const done = all.filter((i) => i.status === 'COMPLETED');

    if (sections.includes('openTasks')) {
      pdf.heading(`Offene Aufgaben (${open.length})`);
      if (open.length > 0) {
        pdf.table(
          ['Titel', 'Art', 'Zugewiesen', 'Fällig'],
          open.map((i) => [
            i.title,
            i.kind,
            i.assignedUser?.displayName ?? '-',
            i.dueAt ? new Date(i.dueAt).toLocaleDateString('de-DE') : '-',
          ]),
          [220, 90, 130, 75],
        );
      }
    }

    if (sections.includes('completedTasks')) {
      pdf.heading(`Erledigte Aufgaben (${done.length})`);
      if (done.length > 0) {
        pdf.table(
          ['Titel', 'Art', 'Zugewiesen', 'Erledigt am'],
          done.map((i) => [
            i.title,
            i.kind,
            i.assignedUser?.displayName ?? '-',
            i.completedAt
              ? new Date(i.completedAt).toLocaleDateString('de-DE')
              : '-',
          ]),
          [220, 90, 130, 75],
        );
      }
    }

    return `aufgaben-${todayStr()}.pdf`;
  }

  // ── Document merge ─────────────────────────────────────────

  /**
   * Append selected documents to the bundle. Returns the count of skipped
   * (non-PDF, non-image) files so the caller can surface that to the user.
   */
  private async appendDocuments(
    pdf: PdfBuilder,
    documentIds: string[],
  ): Promise<number> {
    let skipped = 0;
    for (const id of documentIds) {
      try {
        const { stream, document } = await this.documents.getFileStream(id);
        const bytes = await streamToBuffer(stream);
        const mime = (document.mimeType || '').toLowerCase();
        if (mime === 'application/pdf') {
          await this.appendPdf(pdf, bytes);
        } else if (
          mime === 'image/png' ||
          mime === 'image/jpeg' ||
          mime === 'image/jpg'
        ) {
          await this.appendImage(pdf, bytes, mime);
        } else {
          // Non-PDF/non-image: ignored by design (DOCX/XLSX/etc.).
          // Future extension point: convert to PDF first, then call appendPdf.
          skipped += 1;
          this.logger.log(
            `Skipped document ${id} during bundle merge (mime=${mime}).`,
          );
        }
      } catch (e) {
        skipped += 1;
        this.logger.warn(
          `Failed to append document ${id}: ${(e as Error).message}`,
        );
      }
    }
    return skipped;
  }

  private async appendPdf(builder: PdfBuilder, bytes: Buffer): Promise<void> {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const indices = src.getPageIndices();
    const copied = await builder.pdf.copyPages(src, indices);
    for (const page of copied) {
      builder.pdf.addPage(page);
    }
  }

  private async appendImage(
    builder: PdfBuilder,
    bytes: Buffer,
    mime: string,
  ): Promise<void> {
    const image =
      mime === 'image/png'
        ? await builder.pdf.embedPng(bytes)
        : await builder.pdf.embedJpg(bytes);
    // Fit to A4 with margin while preserving aspect ratio.
    const maxW = 595.28 - 40;
    const maxH = 841.89 - 40;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const page = builder.addImagePage(595.28, 841.89);
    page.drawImage(image, {
      x: (595.28 - drawW) / 2,
      y: (841.89 - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────

function formatAddress(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && String(p).trim()).join(', ');
}

function toDateString(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('de-DE');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}
