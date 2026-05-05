import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DUPLICATE_STRATEGIES,
  DuplicateStrategy,
} from '../dto/planning-import.dto';
import { CsvActualsProvider } from './csv-actuals-provider';
import {
  ParsedActualCandidate,
  ParseError,
  PlanningProviderType,
} from './data-provider';

/** Limit fuer den persistierten Fehlerreport (gekuerzt). */
const MAX_ERROR_REPORT_ROWS = 200;

/** Pro Zeile: was passiert beim Commit/Dry-Run? */
export type ImportRowAction = 'create' | 'overwrite' | 'skip';

/** Ergebnis pro Zeile fuer die UI-Vorschau. */
export type ImportRowPreview = {
  rowNumber: number;
  action: ImportRowAction;
  /** Bei skip: Grund (z. B. "duplicate"). */
  reason?: string;
  candidate: ParsedActualCandidate;
  /** Existierender DB-Eintrag, falls Duplikat. */
  existing?: {
    id: string;
    actualRevenue: number;
    actualCost: number;
    source: string;
    note: string | null;
  };
};

export type ImportSummary = {
  total: number;
  toCreate: number;
  toOverwrite: number;
  toSkip: number;
  errors: number;
};

export type DryRunResult = {
  jobId: string;
  status: 'succeeded' | 'partial' | 'failed';
  duplicateStrategy: DuplicateStrategy;
  summary: ImportSummary;
  rows: ImportRowPreview[];
  errorReport: ParseError[];
};

export type CommitResult = {
  jobId: string;
  status: 'succeeded' | 'partial' | 'failed';
  duplicateStrategy: DuplicateStrategy;
  summary: {
    total: number;
    created: number;
    overwritten: number;
    skipped: number;
    errors: number;
  };
  errorReport: ParseError[];
};

type RawErrorReport = { rows: ParseError[] } | null | undefined;

/**
 * Wiederverwendbares Listenformat fuer GET /planning/import-jobs.
 * Wir lassen das gekuerzte Fehler-JSON nur in der Detailansicht zu —
 * die Liste bleibt schlank, damit sie nicht jedes Mal komplette Reports
 * an den Browser uebertragen muss.
 */
export type ImportJobSummary = {
  id: string;
  type: string;
  mode: string;
  status: string;
  duplicateStrategy: string;
  filename: string | null;
  totalRows: number;
  successRows: number;
  skippedRows: number;
  errorRows: number;
  startedAt: Date;
  finishedAt: Date | null;
  createdBy: { id: string; displayName: string; email: string } | null;
};

@Injectable()
export class PlanningImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly csvProvider: CsvActualsProvider,
  ) {}

  // ── Liste / Detail ────────────────────────────────────────────

  async listJobs(): Promise<ImportJobSummary[]> {
    const jobs = await this.prisma.planningImportJob.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: {
        createdBy: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });
    return jobs.map((j) => ({
      id: j.id,
      type: j.type,
      mode: j.mode,
      status: j.status,
      duplicateStrategy: j.duplicateStrategy,
      filename: j.filename,
      totalRows: j.totalRows,
      successRows: j.successRows,
      skippedRows: j.skippedRows,
      errorRows: j.errorRows,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      createdBy: j.createdBy ?? null,
    }));
  }

  async getJob(id: string) {
    const job = await this.prisma.planningImportJob.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('Importprotokoll nicht gefunden.');
    }
    const errorReport =
      (job.errorReportJson as RawErrorReport)?.rows ?? [];
    return {
      ...job,
      errorReport,
    };
  }

  async getJobErrorsCsv(id: string): Promise<{
    filename: string;
    content: string;
  }> {
    const job = await this.getJob(id);
    const lines = ['rowNumber,code,message,raw'];
    for (const e of job.errorReport) {
      lines.push(
        [
          e.rowNumber,
          csvField(e.code),
          csvField(e.message),
          csvField(e.raw ?? ''),
        ].join(','),
      );
    }
    return {
      filename: `planning-import-${id}-errors.csv`,
      content: lines.join('\n'),
    };
  }

  // ── Dry-Run ───────────────────────────────────────────────────

  async dryRun(
    file: { buffer: Buffer; originalname?: string } | undefined,
    duplicateStrategy: DuplicateStrategy,
    userId?: string,
  ): Promise<DryRunResult> {
    return this.run('csv', file, duplicateStrategy, userId, 'dry-run');
  }

  // ── Commit ────────────────────────────────────────────────────

  async commit(
    file: { buffer: Buffer; originalname?: string } | undefined,
    duplicateStrategy: DuplicateStrategy,
    userId?: string,
  ): Promise<CommitResult> {
    const result = await this.run(
      'csv',
      file,
      duplicateStrategy,
      userId,
      'commit',
    );
    // run() liefert immer das DryRun-Format zurueck; bei Commit haben wir
    // tatsaechliche Aktionen ausgefuehrt — den Summary fuer den Aufrufer in
    // CommitResult-Form abbilden.
    const created = result.summary.toCreate;
    const overwritten = result.summary.toOverwrite;
    const skipped = result.summary.toSkip;
    return {
      jobId: result.jobId,
      status: result.status,
      duplicateStrategy: result.duplicateStrategy,
      summary: {
        total: result.summary.total,
        created,
        overwritten,
        skipped,
        errors: result.summary.errors,
      },
      errorReport: result.errorReport,
    };
  }

  // ── Gemeinsamer Pfad fuer Dry-Run + Commit ─────────────────────

  private async run(
    providerType: PlanningProviderType,
    file: { buffer: Buffer; originalname?: string } | undefined,
    duplicateStrategy: DuplicateStrategy,
    userId: string | undefined,
    mode: 'dry-run' | 'commit',
  ): Promise<DryRunResult> {
    if (!DUPLICATE_STRATEGIES.includes(duplicateStrategy)) {
      throw new BadRequestException(
        `Unbekannte Duplikatstrategie: ${duplicateStrategy}`,
      );
    }
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('CSV-Datei fehlt oder ist leer.');
    }
    if (providerType !== 'csv') {
      throw new BadRequestException(
        `Provider "${providerType}" ist noch nicht implementiert.`,
      );
    }
    const text = file.buffer.toString('utf-8');
    const parseResult = this.csvProvider.parse({ text });
    const candidates = parseResult.candidates;
    const parseErrors = parseResult.errors;

    // Vorhandene (year, month) DB-Eintraege fuer Duplikatabgleich nachladen.
    const existingMap = await this.fetchExistingMap(candidates);

    const rows: ImportRowPreview[] = [];
    for (const c of candidates) {
      const key = ymKey(c.year, c.month);
      const existing = existingMap.get(key);
      if (!existing) {
        rows.push({ rowNumber: c.rowNumber, action: 'create', candidate: c });
        continue;
      }
      if (duplicateStrategy === 'skip') {
        rows.push({
          rowNumber: c.rowNumber,
          action: 'skip',
          reason: 'duplicate',
          candidate: c,
          existing: {
            id: existing.id,
            actualRevenue: existing.actualRevenue,
            actualCost: existing.actualCost,
            source: existing.source,
            note: existing.note,
          },
        });
      } else {
        rows.push({
          rowNumber: c.rowNumber,
          action: 'overwrite',
          candidate: c,
          existing: {
            id: existing.id,
            actualRevenue: existing.actualRevenue,
            actualCost: existing.actualCost,
            source: existing.source,
            note: existing.note,
          },
        });
      }
    }

    const summary = computeSummary(rows, parseErrors.length);
    const status: 'succeeded' | 'partial' | 'failed' =
      parseErrors.length === 0 && rows.length > 0
        ? 'succeeded'
        : rows.length === 0
          ? 'failed'
          : 'partial';

    let actuallyCreated = 0;
    let actuallyOverwritten = 0;
    let actuallySkipped = 0;

    if (mode === 'commit') {
      // Persistenz in einer Transaktion, damit ein Fehler in der Mitte
      // den gesamten Import zurueckrollt.
      await this.prisma.$transaction(async (tx) => {
        for (const row of rows) {
          if (row.action === 'create') {
            await tx.planningActualMonthly.create({
              data: {
                year: row.candidate.year,
                month: row.candidate.month,
                actualRevenue: row.candidate.actualRevenue,
                actualCost: row.candidate.actualCost,
                actualHours: row.candidate.actualHours ?? null,
                actualOvertimeHours:
                  row.candidate.actualOvertimeHours ?? null,
                source: row.candidate.source ?? 'import',
                note: row.candidate.note ?? null,
                createdByUserId: userId ?? null,
              },
            });
            actuallyCreated++;
          } else if (row.action === 'overwrite' && row.existing) {
            await tx.planningActualMonthly.update({
              where: { id: row.existing.id },
              data: {
                actualRevenue: row.candidate.actualRevenue,
                actualCost: row.candidate.actualCost,
                actualHours: row.candidate.actualHours ?? null,
                actualOvertimeHours:
                  row.candidate.actualOvertimeHours ?? null,
                source: row.candidate.source ?? 'import',
                note: row.candidate.note ?? null,
              },
            });
            actuallyOverwritten++;
          } else {
            actuallySkipped++;
          }
        }
      });
    }

    const finalSummary: ImportSummary =
      mode === 'commit'
        ? {
            total: summary.total,
            toCreate: actuallyCreated,
            toOverwrite: actuallyOverwritten,
            toSkip: actuallySkipped,
            errors: summary.errors,
          }
        : summary;

    const job = await this.prisma.planningImportJob.create({
      data: {
        type: `${providerType}.actuals`,
        mode,
        status,
        duplicateStrategy,
        filename: file.originalname ?? null,
        totalRows: parseErrors.length + candidates.length,
        successRows: mode === 'commit' ? actuallyCreated + actuallyOverwritten : finalSummary.toCreate + finalSummary.toOverwrite,
        skippedRows: mode === 'commit' ? actuallySkipped : finalSummary.toSkip,
        errorRows: parseErrors.length,
        errorReportJson:
          parseErrors.length > 0
            ? ({
                rows: parseErrors.slice(0, MAX_ERROR_REPORT_ROWS),
              } as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        createdByUserId: userId ?? null,
        finishedAt: new Date(),
      },
    });

    return {
      jobId: job.id,
      status,
      duplicateStrategy,
      summary: finalSummary,
      rows,
      errorReport: parseErrors,
    };
  }

  private async fetchExistingMap(
    candidates: ParsedActualCandidate[],
  ): Promise<
    Map<
      string,
      {
        id: string;
        year: number;
        month: number;
        actualRevenue: number;
        actualCost: number;
        source: string;
        note: string | null;
      }
    >
  > {
    if (candidates.length === 0) return new Map();
    const conditions = candidates.map((c) => ({
      year: c.year,
      month: c.month,
    }));
    const existing = await this.prisma.planningActualMonthly.findMany({
      where: { OR: conditions },
      select: {
        id: true,
        year: true,
        month: true,
        actualRevenue: true,
        actualCost: true,
        source: true,
        note: true,
      },
    });
    const map = new Map<
      string,
      {
        id: string;
        year: number;
        month: number;
        actualRevenue: number;
        actualCost: number;
        source: string;
        note: string | null;
      }
    >();
    for (const e of existing) {
      map.set(ymKey(e.year, e.month), e);
    }
    return map;
  }
}

function computeSummary(
  rows: ImportRowPreview[],
  errorCount: number,
): ImportSummary {
  let toCreate = 0;
  let toOverwrite = 0;
  let toSkip = 0;
  for (const r of rows) {
    if (r.action === 'create') toCreate++;
    else if (r.action === 'overwrite') toOverwrite++;
    else toSkip++;
  }
  return {
    total: rows.length + errorCount,
    toCreate,
    toOverwrite,
    toSkip,
    errors: errorCount,
  };
}

function ymKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function csvField(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
