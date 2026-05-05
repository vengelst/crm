import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import {
  PatchPlanningScenarioDto,
  UpsertPlanningScenarioDto,
} from './dto/planning-scenario.dto';
import { UpdatePlanningTargetsDto } from './dto/planning-targets.dto';
import {
  PatchPlanningActualDto,
  RestorePlanningVersionDto,
  UpsertPlanningActualDto,
} from './dto/planning-actual.dto';

const DEFAULT_WEEKS_PER_MONTH = 4.33;

/**
 * Planung — Persistente Szenarien fuer das Ertragsplanungstool.
 *
 * Die eigentliche Periodenrechnung (Woche/Monat/Quartal/Halbjahr) findet im
 * Frontend statt; das Backend speichert ausschliesslich die Eingangsgroessen
 * inklusive `weeksPerMonth`, damit Editor und Vergleich auf identischer
 * Datenbasis rechnen.
 */
@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter?: {
    locationId?: string | null;
    businessUnitId?: string | null;
    status?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filter?.locationId !== undefined) {
      where.locationId = filter.locationId;
    }
    if (filter?.businessUnitId !== undefined) {
      where.businessUnitId = filter.businessUnitId;
    }
    if (filter?.status) {
      where.status = filter.status;
    }
    return this.prisma.planningScenario.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: this.creatorInclude,
    });
  }

  async getById(id: string) {
    const scenario = await this.prisma.planningScenario.findUnique({
      where: { id },
      include: this.creatorInclude,
    });
    if (!scenario) throw new NotFoundException('Szenario nicht gefunden.');
    return scenario;
  }

  async create(dto: UpsertPlanningScenarioDto, userId: string) {
    const created = await this.prisma.planningScenario.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        teamsPerWeek: dto.teamsPerWeek,
        workersPerTeam: dto.workersPerTeam,
        costPerWorkerWeek: dto.costPerWorkerWeek,
        regularHoursPerWorkerWeek: dto.regularHoursPerWorkerWeek,
        overtimeHoursPerWorkerWeek: dto.overtimeHoursPerWorkerWeek,
        regularRatePerHour: dto.regularRatePerHour,
        overtimeRatePerHour: dto.overtimeRatePerHour,
        weeksPerMonth: dto.weeksPerMonth ?? DEFAULT_WEEKS_PER_MONTH,
        createdByUserId: userId,
      },
      include: this.creatorInclude,
    });
    await this.snapshotVersion(created.id, userId, 'created');
    return created;
  }

  async update(id: string, dto: PatchPlanningScenarioDto, userId?: string) {
    await this.getById(id);
    const updated = await this.prisma.planningScenario.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.teamsPerWeek !== undefined
          ? { teamsPerWeek: dto.teamsPerWeek }
          : {}),
        ...(dto.workersPerTeam !== undefined
          ? { workersPerTeam: dto.workersPerTeam }
          : {}),
        ...(dto.costPerWorkerWeek !== undefined
          ? { costPerWorkerWeek: dto.costPerWorkerWeek }
          : {}),
        ...(dto.regularHoursPerWorkerWeek !== undefined
          ? { regularHoursPerWorkerWeek: dto.regularHoursPerWorkerWeek }
          : {}),
        ...(dto.overtimeHoursPerWorkerWeek !== undefined
          ? { overtimeHoursPerWorkerWeek: dto.overtimeHoursPerWorkerWeek }
          : {}),
        ...(dto.regularRatePerHour !== undefined
          ? { regularRatePerHour: dto.regularRatePerHour }
          : {}),
        ...(dto.overtimeRatePerHour !== undefined
          ? { overtimeRatePerHour: dto.overtimeRatePerHour }
          : {}),
        ...(dto.weeksPerMonth !== undefined
          ? { weeksPerMonth: dto.weeksPerMonth }
          : {}),
      },
      include: this.creatorInclude,
    });
    await this.snapshotVersion(id, userId, 'updated');
    return updated;
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.planningScenario.delete({ where: { id } });
    return { deleted: true };
  }

  async duplicate(id: string, userId: string) {
    const source = await this.getById(id);
    const created = await this.prisma.planningScenario.create({
      data: {
        name: `${source.name} (Kopie)`,
        description: source.description,
        teamsPerWeek: source.teamsPerWeek,
        workersPerTeam: source.workersPerTeam,
        costPerWorkerWeek: source.costPerWorkerWeek,
        regularHoursPerWorkerWeek: source.regularHoursPerWorkerWeek,
        overtimeHoursPerWorkerWeek: source.overtimeHoursPerWorkerWeek,
        regularRatePerHour: source.regularRatePerHour,
        overtimeRatePerHour: source.overtimeRatePerHour,
        weeksPerMonth: source.weeksPerMonth,
        targetMonthlyRevenue: source.targetMonthlyRevenue,
        targetMonthlyMargin: source.targetMonthlyMargin,
        targetMarginPercent: source.targetMarginPercent,
        createdByUserId: userId,
      },
      include: this.creatorInclude,
    });
    await this.snapshotVersion(
      created.id,
      userId,
      `duplicated from ${source.id}`,
    );
    return created;
  }

  /**
   * Zielwerte separat pflegen. Felder, die im DTO als `null` durchgereicht
   * werden, werden explizit zurueckgesetzt; nicht enthaltene Felder
   * (also `undefined`) bleiben unveraendert.
   *
   * `class-transformer` legt fuer fehlende DTO-Properties standardmaessig
   * `undefined` an, sodass `'in'` nicht zwischen "nicht gesendet" und
   * "explizit null" unterscheidet — wir nutzen daher den Originalbody als
   * zweite Quelle der Wahrheit (falls verfuegbar).
   */
  async updateTargets(
    id: string,
    dto: UpdatePlanningTargetsDto,
    rawKeys?: ReadonlyArray<keyof UpdatePlanningTargetsDto>,
    userId?: string,
  ) {
    await this.getById(id);
    const data: Record<string, number | null> = {};
    const include = (key: keyof UpdatePlanningTargetsDto) =>
      rawKeys ? rawKeys.includes(key) : dto[key] !== undefined;

    if (include('targetMonthlyRevenue')) {
      data.targetMonthlyRevenue = dto.targetMonthlyRevenue ?? null;
    }
    if (include('targetMonthlyMargin')) {
      data.targetMonthlyMargin = dto.targetMonthlyMargin ?? null;
    }
    if (include('targetMarginPercent')) {
      data.targetMarginPercent = dto.targetMarginPercent ?? null;
    }
    if (Object.keys(data).length === 0) {
      // Nichts zu tun — gib aktuellen Stand zurueck.
      return this.getById(id);
    }
    const updated = await this.prisma.planningScenario.update({
      where: { id },
      data,
      include: this.creatorInclude,
    });
    await this.snapshotVersion(id, userId, 'targets updated');
    return updated;
  }

  // ── Phase 4: Versionierung ─────────────────────────────────

  /** Schreibt einen JSON-Snapshot des aktuellen Szenariostandes. */
  private async snapshotVersion(
    scenarioId: string,
    userId?: string,
    changeNote?: string,
  ): Promise<void> {
    const scenario = await this.prisma.planningScenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) return;
    const last = await this.prisma.planningScenarioVersion.findFirst({
      where: { scenarioId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const versionNumber = (last?.versionNumber ?? 0) + 1;
    await this.prisma.planningScenarioVersion.create({
      data: {
        scenarioId,
        versionNumber,
        changeNote: changeNote ?? null,
        changedByUserId: userId ?? null,
        snapshotJson: serializeScenarioSnapshot(scenario),
      },
    });
  }

  listVersions(scenarioId: string) {
    return this.prisma.planningScenarioVersion.findMany({
      where: { scenarioId },
      orderBy: [{ versionNumber: 'desc' }],
      include: {
        changedBy: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async getVersion(scenarioId: string, versionId: string) {
    const version = await this.prisma.planningScenarioVersion.findFirst({
      where: { id: versionId, scenarioId },
      include: {
        changedBy: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!version) throw new NotFoundException('Version nicht gefunden.');
    return version;
  }

  /**
   * Setzt einen Szenariostand auf einen vorhandenen Snapshot zurueck und legt
   * automatisch eine neue Version mit Hinweis auf die Quelle an.
   */
  async restoreVersion(
    scenarioId: string,
    versionId: string,
    dto: RestorePlanningVersionDto,
    userId?: string,
  ) {
    const version = await this.getVersion(scenarioId, versionId);
    const snap = readScenarioSnapshot(version.snapshotJson);
    if (!snap) {
      throw new BadRequestException('Snapshot konnte nicht gelesen werden.');
    }
    const updated = await this.prisma.planningScenario.update({
      where: { id: scenarioId },
      data: {
        name: snap.name,
        description: snap.description,
        teamsPerWeek: snap.teamsPerWeek,
        workersPerTeam: snap.workersPerTeam,
        costPerWorkerWeek: snap.costPerWorkerWeek,
        regularHoursPerWorkerWeek: snap.regularHoursPerWorkerWeek,
        overtimeHoursPerWorkerWeek: snap.overtimeHoursPerWorkerWeek,
        regularRatePerHour: snap.regularRatePerHour,
        overtimeRatePerHour: snap.overtimeRatePerHour,
        weeksPerMonth: snap.weeksPerMonth,
        targetMonthlyRevenue: snap.targetMonthlyRevenue,
        targetMonthlyMargin: snap.targetMonthlyMargin,
        targetMarginPercent: snap.targetMarginPercent,
      },
      include: this.creatorInclude,
    });
    const note =
      dto.changeNote?.trim() || `restored from v${version.versionNumber}`;
    await this.snapshotVersion(scenarioId, userId, note);
    return updated;
  }

  // ── Phase 4: Ist-Werte (CRUD) ──────────────────────────────

  listActuals(filter?: { from?: string; to?: string }) {
    const where: Record<string, unknown> = {};
    const range = parseYearMonthRange(filter?.from, filter?.to);
    if (range) {
      where.OR = range.map(({ year, month }) => ({ year, month }));
    }
    return this.prisma.planningActualMonthly.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  createActual(dto: UpsertPlanningActualDto, userId: string) {
    return this.prisma.planningActualMonthly.create({
      data: {
        year: dto.year,
        month: dto.month,
        actualRevenue: dto.actualRevenue,
        actualCost: dto.actualCost,
        actualHours: dto.actualHours ?? null,
        actualOvertimeHours: dto.actualOvertimeHours ?? null,
        source: dto.source ?? 'manual',
        note: dto.note?.trim() || null,
        createdByUserId: userId,
      },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async updateActual(id: string, dto: PatchPlanningActualDto) {
    const existing = await this.prisma.planningActualMonthly.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Ist-Datensatz nicht gefunden.');
    return this.prisma.planningActualMonthly.update({
      where: { id },
      data: {
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.month !== undefined ? { month: dto.month } : {}),
        ...(dto.actualRevenue !== undefined
          ? { actualRevenue: dto.actualRevenue }
          : {}),
        ...(dto.actualCost !== undefined ? { actualCost: dto.actualCost } : {}),
        ...(dto.actualHours !== undefined
          ? { actualHours: dto.actualHours }
          : {}),
        ...(dto.actualOvertimeHours !== undefined
          ? { actualOvertimeHours: dto.actualOvertimeHours }
          : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async removeActual(id: string) {
    const existing = await this.prisma.planningActualMonthly.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Ist-Datensatz nicht gefunden.');
    await this.prisma.planningActualMonthly.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Phase 4: Plan-vs-Ist + Forecast ─────────────────────────

  async getPlanVsActual(
    scenarioId: string,
    fromYearMonth?: string,
    toYearMonth?: string,
  ) {
    const scenario = await this.getById(scenarioId);
    const range = parseYearMonthRange(fromYearMonth, toYearMonth);
    const months = range ?? defaultLastNMonths(12);
    const ranges = months.map(({ year, month }) => ({ year, month }));
    const actuals = await this.prisma.planningActualMonthly.findMany({
      where: { OR: ranges },
    });
    const actualByKey = new Map(
      actuals.map((a) => [`${a.year}-${a.month}`, a]),
    );
    const plan = calcMonthlyPlan(scenario);
    const rows = months.map(({ year, month }) => {
      const actual = actualByKey.get(`${year}-${month}`) ?? null;
      const planRevenue = plan.revenue;
      const planCost = plan.cost;
      const planMargin = plan.margin;
      const actualRevenue = actual?.actualRevenue ?? null;
      const actualCost = actual?.actualCost ?? null;
      const actualMargin =
        actualRevenue != null && actualCost != null
          ? actualRevenue - actualCost
          : null;
      return {
        year,
        month,
        planRevenue,
        planCost,
        planMargin,
        actualRevenue,
        actualCost,
        actualMargin,
        deltaRevenue:
          actualRevenue != null ? actualRevenue - planRevenue : null,
        deltaCost: actualCost != null ? actualCost - planCost : null,
        deltaMargin: actualMargin != null ? actualMargin - planMargin : null,
        deltaRevenuePercent:
          actualRevenue != null && planRevenue !== 0
            ? ((actualRevenue - planRevenue) / planRevenue) * 100
            : null,
        deltaMarginPercent:
          actualMargin != null && planMargin !== 0
            ? ((actualMargin - planMargin) / planMargin) * 100
            : null,
        actualSource: actual?.source ?? null,
      };
    });
    return { scenarioId, plan, rows };
  }

  async getForecast(
    scenarioId: string,
    months: number,
    mode: 'plan' | 'trend',
  ) {
    const scenario = await this.getById(scenarioId);
    const safeMonths = Math.max(1, Math.min(12, Math.floor(months || 6)));
    const safeMode: 'plan' | 'trend' = mode === 'trend' ? 'trend' : 'plan';
    const plan = calcMonthlyPlan(scenario);

    let trendBasis: { revenue: number; cost: number } | null = null;
    if (safeMode === 'trend') {
      // Letzte 3 Ist-Monate als gleitender Durchschnitt.
      const lastActuals = await this.prisma.planningActualMonthly.findMany({
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 3,
      });
      if (lastActuals.length >= 1) {
        const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
        trendBasis = {
          revenue: avg(lastActuals.map((a) => a.actualRevenue)),
          cost: avg(lastActuals.map((a) => a.actualCost)),
        };
      }
    }

    const start = nextMonthFromNow();
    const points = [];
    for (let i = 0; i < safeMonths; i++) {
      const ym = addMonths(start, i);
      const revenue =
        safeMode === 'trend' && trendBasis ? trendBasis.revenue : plan.revenue;
      const cost =
        safeMode === 'trend' && trendBasis ? trendBasis.cost : plan.cost;
      const margin = revenue - cost;
      points.push({
        year: ym.year,
        month: ym.month,
        revenue,
        cost,
        margin,
        marginPercent: revenue > 0 ? (margin / revenue) * 100 : 0,
      });
    }

    return {
      scenarioId,
      mode: safeMode,
      basis: safeMode === 'trend' ? trendBasis : null,
      simplifiedNote: 'Vereinfachte Projektion ohne Saisonalitaet.',
      points,
    };
  }

  // ── CSV-Export ──────────────────────────────────────────────

  async buildCsvSingle(
    id: string,
  ): Promise<{ content: Buffer; filename: string }> {
    const scenario = await this.getById(id);
    const csv = renderScenarioCsv([scenario]);
    return {
      content: Buffer.from(csv, 'utf-8'),
      filename: `planning-${slugify(scenario.name)}.csv`,
    };
  }

  async buildCsvCompare(
    ids: string[],
  ): Promise<{ content: Buffer; filename: string }> {
    const list = await this.loadMany(ids);
    const csv = renderScenarioCsv(list);
    return {
      content: Buffer.from(csv, 'utf-8'),
      filename: `planning-compare-${list.length}.csv`,
    };
  }

  // ── PDF-Export ──────────────────────────────────────────────

  async buildPdfSingle(
    id: string,
  ): Promise<{ content: Buffer; filename: string }> {
    const scenario = await this.getById(id);
    const bytes = await renderScenarioPdf([scenario]);
    return {
      content: Buffer.from(bytes),
      filename: `planning-${slugify(scenario.name)}.pdf`,
    };
  }

  async buildPdfCompare(
    ids: string[],
  ): Promise<{ content: Buffer; filename: string }> {
    const list = await this.loadMany(ids);
    const bytes = await renderScenarioPdf(list);
    return {
      content: Buffer.from(bytes),
      filename: `planning-compare-${list.length}.pdf`,
    };
  }

  private async loadMany(ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException(
        'Mindestens eine Szenario-ID erforderlich.',
      );
    }
    const list = await this.prisma.planningScenario.findMany({
      where: { id: { in: ids } },
      include: this.creatorInclude,
    });
    if (list.length === 0) {
      throw new NotFoundException('Szenarien nicht gefunden.');
    }
    // Reihenfolge wie angefragt beibehalten.
    const byId = new Map(list.map((s) => [s.id, s]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as typeof list;
  }

  private readonly creatorInclude = {
    createdBy: {
      select: { id: true, displayName: true, email: true },
    },
    // Phase 7: Standort/Einheit fuer Badges + Filter im UI.
    location: { select: { id: true, name: true, code: true } },
    businessUnit: { select: { id: true, name: true, code: true } },
  } as const;
}

// ── Hilfsfunktionen (modulpriv) ───────────────────────────────

type ScenarioRow = Awaited<ReturnType<PlanningService['getById']>>;

const PERIOD_FACTORS = (weeksPerMonth: number) => ({
  weekly: 1,
  monthly: weeksPerMonth,
  quarterly: weeksPerMonth * 3,
  halfYear: weeksPerMonth * 6,
});

type Calc = {
  workersTotal: number;
  revenuePerWorkerWeek: number;
  weeklyRevenue: number;
  weeklyCost: number;
  weeklyMargin: number;
  marginPercent: number;
  periods: {
    weekly: { revenue: number; cost: number; margin: number };
    monthly: { revenue: number; cost: number; margin: number };
    quarterly: { revenue: number; cost: number; margin: number };
    halfYear: { revenue: number; cost: number; margin: number };
  };
};

function calcScenario(s: ScenarioRow): Calc {
  const workersTotal = Math.max(0, s.teamsPerWeek * s.workersPerTeam);
  const revenuePerWorkerWeek =
    s.regularHoursPerWorkerWeek * s.regularRatePerHour +
    s.overtimeHoursPerWorkerWeek * s.overtimeRatePerHour;
  const weeklyRevenue = workersTotal * revenuePerWorkerWeek;
  const weeklyCost = workersTotal * s.costPerWorkerWeek;
  const weeklyMargin = weeklyRevenue - weeklyCost;
  const factors = PERIOD_FACTORS(s.weeksPerMonth);
  const period = (f: number) => ({
    revenue: weeklyRevenue * f,
    cost: weeklyCost * f,
    margin: weeklyMargin * f,
  });
  return {
    workersTotal,
    revenuePerWorkerWeek,
    weeklyRevenue,
    weeklyCost,
    weeklyMargin,
    marginPercent: weeklyRevenue > 0 ? (weeklyMargin / weeklyRevenue) * 100 : 0,
    periods: {
      weekly: period(factors.weekly),
      monthly: period(factors.monthly),
      quarterly: period(factors.quarterly),
      halfYear: period(factors.halfYear),
    },
  };
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",;\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtNum(n: number, fractionDigits = 2): string {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(fractionDigits);
}

function renderScenarioCsv(scenarios: ScenarioRow[]): string {
  const header = [
    'id',
    'name',
    'description',
    'teamsPerWeek',
    'workersPerTeam',
    'costPerWorkerWeek',
    'regularHoursPerWorkerWeek',
    'overtimeHoursPerWorkerWeek',
    'regularRatePerHour',
    'overtimeRatePerHour',
    'weeksPerMonth',
    'workersTotal',
    'weeklyRevenue',
    'weeklyCost',
    'weeklyMargin',
    'monthlyRevenue',
    'monthlyCost',
    'monthlyMargin',
    'quarterlyRevenue',
    'quarterlyCost',
    'quarterlyMargin',
    'halfYearRevenue',
    'halfYearCost',
    'halfYearMargin',
    'marginPercent',
    'targetMonthlyRevenue',
    'targetMonthlyMargin',
    'targetMarginPercent',
  ];
  const lines = [header.join(';')];
  for (const s of scenarios) {
    const c = calcScenario(s);
    const row = [
      s.id,
      s.name,
      s.description ?? '',
      fmtNum(s.teamsPerWeek),
      fmtNum(s.workersPerTeam),
      fmtNum(s.costPerWorkerWeek),
      fmtNum(s.regularHoursPerWorkerWeek),
      fmtNum(s.overtimeHoursPerWorkerWeek),
      fmtNum(s.regularRatePerHour),
      fmtNum(s.overtimeRatePerHour),
      fmtNum(s.weeksPerMonth),
      fmtNum(c.workersTotal, 0),
      fmtNum(c.periods.weekly.revenue),
      fmtNum(c.periods.weekly.cost),
      fmtNum(c.periods.weekly.margin),
      fmtNum(c.periods.monthly.revenue),
      fmtNum(c.periods.monthly.cost),
      fmtNum(c.periods.monthly.margin),
      fmtNum(c.periods.quarterly.revenue),
      fmtNum(c.periods.quarterly.cost),
      fmtNum(c.periods.quarterly.margin),
      fmtNum(c.periods.halfYear.revenue),
      fmtNum(c.periods.halfYear.cost),
      fmtNum(c.periods.halfYear.margin),
      fmtNum(c.marginPercent),
      s.targetMonthlyRevenue != null ? fmtNum(s.targetMonthlyRevenue) : '',
      s.targetMonthlyMargin != null ? fmtNum(s.targetMonthlyMargin) : '',
      s.targetMarginPercent != null ? fmtNum(s.targetMarginPercent) : '',
    ].map(csvEscape);
    lines.push(row.join(';'));
  }
  // BOM fuer Excel-Kompatibilitaet bei Umlauten.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

async function renderScenarioPdf(
  scenarios: ScenarioRow[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureRoom = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawText = (
    str: string,
    x: number,
    size: number,
    f: PDFFont = font,
    targetPage: PDFPage = page,
  ) => {
    targetPage.drawText(str, { x, y, size, font: f });
  };

  // Deckblatt
  drawText('Ertragsplanung — Export', margin, 20, boldFont);
  y -= 26;
  drawText(`Erstellt: ${new Date().toLocaleString('de-DE')}`, margin, 10);
  y -= 14;
  drawText(`Anzahl Szenarien: ${scenarios.length}`, margin, 10);
  y -= 22;

  // Pro Szenario eine Sektion
  for (const s of scenarios) {
    const c = calcScenario(s);
    ensureRoom(180);
    drawText(s.name, margin, 14, boldFont);
    y -= 16;
    if (s.description) {
      drawText(s.description.slice(0, 120), margin, 9);
      y -= 12;
    }
    drawText(
      `Bearbeiter: ${s.createdBy?.displayName ?? '—'}    Aktualisiert: ${s.updatedAt
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ')}`,
      margin,
      9,
    );
    y -= 18;

    // Eingaben
    drawText('Eingaben', margin, 11, boldFont);
    y -= 14;
    const inputRows: Array<[string, string]> = [
      ['Teams pro Woche', fmtNum(s.teamsPerWeek)],
      ['Monteure pro Team', fmtNum(s.workersPerTeam)],
      ['Stunden regulaer / Woche', fmtNum(s.regularHoursPerWorkerWeek)],
      ['Ueberstunden / Woche', fmtNum(s.overtimeHoursPerWorkerWeek)],
      ['Stundensatz regulaer (EUR)', fmtNum(s.regularRatePerHour)],
      ['Stundensatz Ueberstunden (EUR)', fmtNum(s.overtimeRatePerHour)],
      ['Kosten pro Monteur/Woche (EUR)', fmtNum(s.costPerWorkerWeek)],
      ['Wochen pro Monat', fmtNum(s.weeksPerMonth)],
    ];
    for (const [label, val] of inputRows) {
      drawText(label, margin, 9);
      drawText(val, margin + 240, 9, font);
      y -= 12;
    }

    y -= 6;
    ensureRoom(110);
    drawText('Kennzahlen', margin, 11, boldFont);
    y -= 14;
    drawText(
      `Monteure gesamt: ${c.workersTotal.toFixed(0)}    Marge %: ${c.marginPercent.toFixed(1)} %`,
      margin,
      9,
    );
    y -= 14;

    // Tabelle Periode
    const colX = [
      margin,
      margin + 110,
      margin + 220,
      margin + 330,
      margin + 440,
    ];
    drawText('Periode', colX[0], 9, boldFont);
    drawText('Umsatz (EUR)', colX[1], 9, boldFont);
    drawText('Kosten (EUR)', colX[2], 9, boldFont);
    drawText('Marge (EUR)', colX[3], 9, boldFont);
    drawText('Marge %', colX[4], 9, boldFont);
    y -= 12;
    const periods: Array<[string, Calc['periods'][keyof Calc['periods']]]> = [
      ['Woche', c.periods.weekly],
      ['Monat', c.periods.monthly],
      ['Quartal', c.periods.quarterly],
      ['Halbjahr', c.periods.halfYear],
    ];
    for (const [label, p] of periods) {
      const pPct = p.revenue > 0 ? (p.margin / p.revenue) * 100 : 0;
      drawText(label, colX[0], 9);
      drawText(p.revenue.toFixed(0), colX[1], 9);
      drawText(p.cost.toFixed(0), colX[2], 9);
      drawText(p.margin.toFixed(0), colX[3], 9);
      drawText(`${pPct.toFixed(1)} %`, colX[4], 9);
      y -= 12;
    }

    // Targets
    if (
      s.targetMonthlyRevenue != null ||
      s.targetMonthlyMargin != null ||
      s.targetMarginPercent != null
    ) {
      y -= 6;
      ensureRoom(60);
      drawText('Ziele (Ist vs. Ziel je Monat)', margin, 11, boldFont);
      y -= 14;
      const monthly = c.periods.monthly;
      if (s.targetMonthlyRevenue != null) {
        drawText(
          `Umsatz: Ist ${monthly.revenue.toFixed(0)} EUR / Ziel ${s.targetMonthlyRevenue.toFixed(0)} EUR (${
            s.targetMonthlyRevenue > 0
              ? `${((monthly.revenue / s.targetMonthlyRevenue) * 100).toFixed(1)} %`
              : '—'
          })`,
          margin,
          9,
        );
        y -= 12;
      }
      if (s.targetMonthlyMargin != null) {
        drawText(
          `Marge: Ist ${monthly.margin.toFixed(0)} EUR / Ziel ${s.targetMonthlyMargin.toFixed(0)} EUR (Diff ${(monthly.margin - s.targetMonthlyMargin).toFixed(0)} EUR)`,
          margin,
          9,
        );
        y -= 12;
      }
      if (s.targetMarginPercent != null) {
        drawText(
          `Marge %: Ist ${c.marginPercent.toFixed(1)} % / Ziel ${s.targetMarginPercent.toFixed(1)} %`,
          margin,
          9,
        );
        y -= 12;
      }
    }

    y -= 14;
  }

  // Vergleichstabelle bei mehreren Szenarien
  if (scenarios.length > 1) {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    drawText('Vergleich', margin, 16, boldFont);
    y -= 20;

    const cols = scenarios.slice(0, 6); // max 6 Spalten in Querausnutzung
    const colWidth = (pageWidth - margin * 2 - 130) / Math.max(1, cols.length);
    const colStart = (i: number) => margin + 130 + i * colWidth;

    drawText('Kennzahl', margin, 9, boldFont);
    cols.forEach((s, i) => {
      const name = s.name.length > 18 ? s.name.slice(0, 17) + '…' : s.name;
      drawText(name, colStart(i), 9, boldFont);
    });
    y -= 14;

    const calcs = cols.map(calcScenario);
    const rows: Array<[string, (c: Calc) => string]> = [
      ['Monteure gesamt', (c) => c.workersTotal.toFixed(0)],
      ['Marge %', (c) => `${c.marginPercent.toFixed(1)} %`],
      ['Woche · Umsatz', (c) => c.periods.weekly.revenue.toFixed(0)],
      ['Woche · Marge', (c) => c.periods.weekly.margin.toFixed(0)],
      ['Monat · Umsatz', (c) => c.periods.monthly.revenue.toFixed(0)],
      ['Monat · Marge', (c) => c.periods.monthly.margin.toFixed(0)],
      ['Quartal · Marge', (c) => c.periods.quarterly.margin.toFixed(0)],
      ['Halbjahr · Marge', (c) => c.periods.halfYear.margin.toFixed(0)],
    ];
    for (const [label, fn] of rows) {
      ensureRoom(14);
      drawText(label, margin, 9);
      calcs.forEach((c, i) => drawText(fn(c), colStart(i), 9));
      y -= 12;
    }
  }

  return pdf.save();
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'scenario'
  );
}

// ── Phase 4: Versions-/Aktualisierungs-Helfer ──────────────────

type ScenarioSnapshot = {
  name: string;
  description: string | null;
  teamsPerWeek: number;
  workersPerTeam: number;
  costPerWorkerWeek: number;
  regularHoursPerWorkerWeek: number;
  overtimeHoursPerWorkerWeek: number;
  regularRatePerHour: number;
  overtimeRatePerHour: number;
  weeksPerMonth: number;
  targetMonthlyRevenue: number | null;
  targetMonthlyMargin: number | null;
  targetMarginPercent: number | null;
};

/** Minimal-Shape — funktioniert sowohl mit als auch ohne Creator-Include. */
type SnapshotInput = {
  name: string;
  description: string | null;
  teamsPerWeek: number;
  workersPerTeam: number;
  costPerWorkerWeek: number;
  regularHoursPerWorkerWeek: number;
  overtimeHoursPerWorkerWeek: number;
  regularRatePerHour: number;
  overtimeRatePerHour: number;
  weeksPerMonth: number;
  targetMonthlyRevenue: number | null;
  targetMonthlyMargin: number | null;
  targetMarginPercent: number | null;
};

function serializeScenarioSnapshot(s: SnapshotInput): ScenarioSnapshot {
  return {
    name: s.name,
    description: s.description ?? null,
    teamsPerWeek: s.teamsPerWeek,
    workersPerTeam: s.workersPerTeam,
    costPerWorkerWeek: s.costPerWorkerWeek,
    regularHoursPerWorkerWeek: s.regularHoursPerWorkerWeek,
    overtimeHoursPerWorkerWeek: s.overtimeHoursPerWorkerWeek,
    regularRatePerHour: s.regularRatePerHour,
    overtimeRatePerHour: s.overtimeRatePerHour,
    weeksPerMonth: s.weeksPerMonth,
    targetMonthlyRevenue: s.targetMonthlyRevenue ?? null,
    targetMonthlyMargin: s.targetMonthlyMargin ?? null,
    targetMarginPercent: s.targetMarginPercent ?? null,
  };
}

function readScenarioSnapshot(raw: unknown): ScenarioSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  if (typeof o.name !== 'string') return null;
  return {
    name: o.name,
    description: typeof o.description === 'string' ? o.description : null,
    teamsPerWeek: num(o.teamsPerWeek),
    workersPerTeam: num(o.workersPerTeam),
    costPerWorkerWeek: num(o.costPerWorkerWeek),
    regularHoursPerWorkerWeek: num(o.regularHoursPerWorkerWeek),
    overtimeHoursPerWorkerWeek: num(o.overtimeHoursPerWorkerWeek),
    regularRatePerHour: num(o.regularRatePerHour),
    overtimeRatePerHour: num(o.overtimeRatePerHour),
    weeksPerMonth: num(o.weeksPerMonth) || 4.33,
    targetMonthlyRevenue: numOrNull(o.targetMonthlyRevenue),
    targetMonthlyMargin: numOrNull(o.targetMonthlyMargin),
    targetMarginPercent: numOrNull(o.targetMarginPercent),
  };
}

/** Berechne die Monatswerte (Umsatz/Kosten/Marge) eines Szenarios. */
function calcMonthlyPlan(s: ScenarioRow) {
  const c = calcScenario(s);
  return {
    revenue: c.periods.monthly.revenue,
    cost: c.periods.monthly.cost,
    margin: c.periods.monthly.margin,
    marginPercent:
      c.periods.monthly.revenue > 0
        ? (c.periods.monthly.margin / c.periods.monthly.revenue) * 100
        : 0,
  };
}

/**
 * `from`/`to` als "YYYY-MM"-String parsen und alle Monate dazwischen
 * (inklusive) erzeugen. Liefert null, wenn beide leer sind.
 */
function parseYearMonthRange(
  from?: string,
  to?: string,
): Array<{ year: number; month: number }> | null {
  if (!from && !to) return null;
  const f = parseYm(from) ?? defaultLastNMonths(12)[0];
  const t = parseYm(to) ?? f;
  const out: Array<{ year: number; month: number }> = [];
  let { year, month } = f;
  // Maximal 60 Monate, um Endlos-Schleifen zu vermeiden.
  for (let i = 0; i < 60; i++) {
    out.push({ year, month });
    if (year === t.year && month === t.month) break;
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}

function parseYm(value?: string): { year: number; month: number } | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  return { year: y, month: mo };
}

function defaultLastNMonths(n: number): Array<{ year: number; month: number }> {
  const now = new Date();
  const out: Array<{ year: number; month: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

function nextMonthFromNow(): { year: number; month: number } {
  const now = new Date();
  return addMonths({ year: now.getFullYear(), month: now.getMonth() + 1 }, 1);
}

function addMonths(
  ym: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const idx = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
