import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatchCapacityProfileDto } from './dto';

/**
 * Kapazitaets-Defaults, die greifen wenn fuer ein Szenario noch kein
 * Profil persistiert wurde. Decken den haeufigen Fall „neuer Plan, keine
 * spezielle Annahme" ab — 40h × 85% × 95% liefert ~32 h netto/Worker/Woche.
 */
const DEFAULT_TARGET_HOURS = 40;
const DEFAULT_AVAILABILITY = 0.85;
const DEFAULT_PRODUCTIVITY = 0.95;

const STATUS_GREEN_MAX = 85;
const STATUS_YELLOW_MAX = 100;

export type CapacityProfileSummary = {
  id: string | null;
  scenarioId: string;
  weeklyTargetHours: number;
  availabilityFactor: number;
  productivityFactor: number;
  /** Pro Worker: target * availability * productivity. */
  availableHoursPerWorkerWeek: number;
  /** Worker pro Team aus dem Szenario. */
  workersPerTeam: number;
  teamsPerWeek: number;
  /** Pro Team: availableHoursPerWorker * workersPerTeam. */
  availableHoursPerTeamWeek: number;
  /** Gesamt: availableHoursPerTeam * teamsPerWeek. */
  availableHoursWeekTotal: number;
  /** Bedarf laut Szenario: teams * workers * (regular + overtime) hours. */
  demandHoursWeek: number;
  /** Verfuegbar - Bedarf, in Stunden. */
  capacityDeltaWeek: number;
  /** Bedarf / Verfuegbar in % (0 wenn Verfuegbar = 0). */
  utilizationPercentWeek: number;
};

export type UtilizationStatus = 'green' | 'yellow' | 'red';

export type UtilizationWeek = {
  isoYear: number;
  isoWeek: number;
  weekStart: string; // ISO-Datum
  availableHours: number;
  demandHours: number;
  deltaHours: number;
  utilizationPercent: number;
  status: UtilizationStatus;
};

export type UtilizationProjection = {
  scenarioId: string;
  weeks: UtilizationWeek[];
  averageUtilizationPercent: number;
  peakUtilizationPercent: number;
  weeksOverThreshold: number;
  minDeltaHours: number;
};

export type Bottleneck = {
  weekStart: string;
  isoYear: number;
  isoWeek: number;
  utilizationPercent: number;
  shortfallHours: number;
  /** Vorgeschlagene zusaetzliche Teams: ceil(shortfall / hoursPerTeam). */
  additionalTeams: number;
  /** Alternativ direkt zusaetzliche Worker-Stunden. */
  additionalWorkerHours: number;
};

export type BottlenecksResult = {
  scenarioId: string;
  thresholdPercent: number;
  weeks: Bottleneck[];
  /** Quick-Fix-Hinweis fuer das UI (lokalisierbar). */
  suggestion: string | null;
};

@Injectable()
export class PlanningCapacityService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profil laden / patchen ───────────────────────────────────

  async getProfile(scenarioId: string): Promise<CapacityProfileSummary> {
    const scenario = await this.assertScenario(scenarioId);
    const profile = await this.findDefaultProfile(scenarioId);

    const weeklyTargetHours =
      profile?.weeklyTargetHours ?? DEFAULT_TARGET_HOURS;
    const availabilityFactor =
      profile?.availabilityFactor ?? DEFAULT_AVAILABILITY;
    const productivityFactor =
      profile?.productivityFactor ?? DEFAULT_PRODUCTIVITY;

    return summarize(
      scenario,
      profile?.id ?? null,
      weeklyTargetHours,
      availabilityFactor,
      productivityFactor,
    );
  }

  async patchProfile(
    scenarioId: string,
    dto: PatchCapacityProfileDto,
  ): Promise<CapacityProfileSummary> {
    const scenario = await this.assertScenario(scenarioId);
    const existing = await this.findDefaultProfile(scenarioId);
    if (existing) {
      const updated = await this.prisma.planningCapacityProfile.update({
        where: { id: existing.id },
        data: {
          ...(dto.weeklyTargetHours !== undefined
            ? { weeklyTargetHours: dto.weeklyTargetHours }
            : {}),
          ...(dto.availabilityFactor !== undefined
            ? { availabilityFactor: dto.availabilityFactor }
            : {}),
          ...(dto.productivityFactor !== undefined
            ? { productivityFactor: dto.productivityFactor }
            : {}),
        },
      });
      return summarize(
        scenario,
        updated.id,
        updated.weeklyTargetHours,
        updated.availabilityFactor,
        updated.productivityFactor,
      );
    }
    const created = await this.prisma.planningCapacityProfile.create({
      data: {
        scenarioId,
        weeklyTargetHours: dto.weeklyTargetHours ?? DEFAULT_TARGET_HOURS,
        availabilityFactor: dto.availabilityFactor ?? DEFAULT_AVAILABILITY,
        productivityFactor: dto.productivityFactor ?? DEFAULT_PRODUCTIVITY,
      },
    });
    return summarize(
      scenario,
      created.id,
      created.weeklyTargetHours,
      created.availabilityFactor,
      created.productivityFactor,
    );
  }

  // ── Auslastung pro Woche ─────────────────────────────────────

  async getUtilization(
    scenarioId: string,
    weeks: number,
  ): Promise<UtilizationProjection> {
    const summary = await this.getProfile(scenarioId);
    const horizon = Math.max(1, Math.min(52, weeks || 12));

    const weekList = nextNIsoWeeks(horizon);
    const weeksOut: UtilizationWeek[] = [];
    let sumUtil = 0;
    let peak = 0;
    let overThreshold = 0;
    let minDelta = Number.POSITIVE_INFINITY;

    for (const w of weekList) {
      const available = summary.availableHoursWeekTotal;
      const demand = summary.demandHoursWeek;
      const delta = available - demand;
      const utilization = available > 0 ? (demand / available) * 100 : 0;
      const status =
        utilization > STATUS_YELLOW_MAX
          ? 'red'
          : utilization > STATUS_GREEN_MAX
            ? 'yellow'
            : 'green';

      sumUtil += utilization;
      if (utilization > peak) peak = utilization;
      if (utilization > STATUS_YELLOW_MAX) overThreshold++;
      if (delta < minDelta) minDelta = delta;

      weeksOut.push({
        isoYear: w.isoYear,
        isoWeek: w.isoWeek,
        weekStart: w.weekStart,
        availableHours: available,
        demandHours: demand,
        deltaHours: delta,
        utilizationPercent: utilization,
        status,
      });
    }

    return {
      scenarioId,
      weeks: weeksOut,
      averageUtilizationPercent:
        weeksOut.length > 0 ? sumUtil / weeksOut.length : 0,
      peakUtilizationPercent: peak,
      weeksOverThreshold: overThreshold,
      minDeltaHours: weeksOut.length > 0 ? minDelta : 0,
    };
  }

  // ── Engpasswarnungen + Quick-Fix ─────────────────────────────

  async getBottlenecks(
    scenarioId: string,
    weeks: number,
    thresholdPercent = STATUS_YELLOW_MAX,
  ): Promise<BottlenecksResult> {
    const summary = await this.getProfile(scenarioId);
    const projection = await this.getUtilization(scenarioId, weeks);
    const bottleneckWeeks: Bottleneck[] = [];

    for (const w of projection.weeks) {
      if (w.utilizationPercent <= thresholdPercent) continue;
      const shortfall = Math.max(0, w.demandHours - w.availableHours);
      const additionalTeams =
        summary.availableHoursPerTeamWeek > 0
          ? Math.ceil(shortfall / summary.availableHoursPerTeamWeek)
          : 0;
      bottleneckWeeks.push({
        weekStart: w.weekStart,
        isoYear: w.isoYear,
        isoWeek: w.isoWeek,
        utilizationPercent: w.utilizationPercent,
        shortfallHours: shortfall,
        additionalTeams,
        additionalWorkerHours: shortfall,
      });
    }

    let suggestion: string | null = null;
    if (bottleneckWeeks.length > 0) {
      // Engpaesse zu zusammenhaengenden Bloecken gruppieren — der Hint
      // erwaehnt die laengste Spanne und die maximal benoetigten Teams.
      const groups = groupConsecutive(bottleneckWeeks);
      const biggest = groups.reduce(
        (a, b) => (b.length > a.length ? b : a),
        groups[0],
      );
      const teamsNeeded = Math.max(...biggest.map((b) => b.additionalTeams), 0);
      const fromIso = `${biggest[0].isoYear}-W${String(biggest[0].isoWeek).padStart(2, '0')}`;
      const toIso = `${biggest[biggest.length - 1].isoYear}-W${String(
        biggest[biggest.length - 1].isoWeek,
      ).padStart(2, '0')}`;
      suggestion = `+${teamsNeeded} Team(s) fuer ${fromIso}–${toIso} reduziert den Engpass.`;
    }

    return {
      scenarioId,
      thresholdPercent,
      weeks: bottleneckWeeks,
      suggestion,
    };
  }

  // ── interne Helfer ───────────────────────────────────────────

  private async assertScenario(id: string) {
    const s = await this.prisma.planningScenario.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Szenario nicht gefunden.');
    return s;
  }

  private async findDefaultProfile(scenarioId: string) {
    return this.prisma.planningCapacityProfile.findFirst({
      where: { scenarioId, teamId: null, workerId: null },
      orderBy: { createdAt: 'asc' },
    });
  }
}

function summarize(
  scenario: {
    teamsPerWeek: number;
    workersPerTeam: number;
    regularHoursPerWorkerWeek: number;
    overtimeHoursPerWorkerWeek: number;
  },
  profileId: string | null,
  weeklyTargetHours: number,
  availabilityFactor: number,
  productivityFactor: number,
): CapacityProfileSummary {
  const availPerWorker =
    weeklyTargetHours * availabilityFactor * productivityFactor;
  const availPerTeam = availPerWorker * scenario.workersPerTeam;
  const availTotal = availPerTeam * scenario.teamsPerWeek;
  const demand =
    scenario.teamsPerWeek *
    scenario.workersPerTeam *
    (scenario.regularHoursPerWorkerWeek + scenario.overtimeHoursPerWorkerWeek);
  const delta = availTotal - demand;
  const util = availTotal > 0 ? (demand / availTotal) * 100 : 0;
  return {
    id: profileId,
    scenarioId: '',
    weeklyTargetHours,
    availabilityFactor,
    productivityFactor,
    availableHoursPerWorkerWeek: availPerWorker,
    workersPerTeam: scenario.workersPerTeam,
    teamsPerWeek: scenario.teamsPerWeek,
    availableHoursPerTeamWeek: availPerTeam,
    availableHoursWeekTotal: availTotal,
    demandHoursWeek: demand,
    capacityDeltaWeek: delta,
    utilizationPercentWeek: util,
  };
}

/**
 * Generiert eine Liste von ISO-Wochen ab dem Montag der aktuellen Woche.
 *
 * Wir berechnen ISO-Year/Week selbst, weil JavaScript das nicht nativ
 * bereitstellt — Reference: ISO 8601 (Mo = erster Tag, Woche 1 enthaelt
 * den ersten Donnerstag des Jahres).
 */
function nextNIsoWeeks(n: number) {
  const out: { isoYear: number; isoWeek: number; weekStart: string }[] = [];
  const d = startOfIsoWeek(new Date());
  for (let i = 0; i < n; i++) {
    const target = new Date(d);
    target.setDate(d.getDate() + i * 7);
    const { year, week } = isoWeekParts(target);
    out.push({
      isoYear: year,
      isoWeek: week,
      weekStart: target.toISOString().slice(0, 10),
    });
  }
  return out;
}

function startOfIsoWeek(d: Date) {
  const day = d.getDay() || 7; // Sonntag=0 -> 7
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function isoWeekParts(d: Date) {
  // Algorithmus: verschiebe auf Donnerstag derselben ISO-Woche, dann ist
  // Year(d) das ISO-Year und (d - jan1)/7 + 1 die ISO-Woche.
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // Mo=0
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week =
    1 + Math.round((tmp.getTime() - firstThursday.getTime()) / 86400000 / 7);
  return { year: tmp.getUTCFullYear(), week };
}

function groupConsecutive(weeks: Bottleneck[]): Bottleneck[][] {
  // Aufeinanderfolgende ISO-Wochen (mit Jahreswechsel-Toleranz) bilden
  // einen Engpass-Block. Beispiel: 2026-W23, 2026-W24, 2026-W25 = 1 Block.
  if (weeks.length === 0) return [];
  const sorted = [...weeks].sort(
    (a, b) => a.isoYear * 100 + a.isoWeek - (b.isoYear * 100 + b.isoWeek),
  );
  const out: Bottleneck[][] = [];
  let cur: Bottleneck[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (next.isoYear === prev.isoYear && next.isoWeek === prev.isoWeek + 1) {
      cur.push(next);
    } else {
      out.push(cur);
      cur = [next];
    }
  }
  out.push(cur);
  return out;
}
