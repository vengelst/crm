import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanningService } from '../planning.service';
import { PlanningBaselineService } from '../workflow/planning-baseline.service';

const DEFAULT_WEEKS_PER_MONTH = 4.33;

/**
 * KPI-Aggregator fuer das Dashboard.
 *
 * Reichert die bestehenden PlanVsActual-/Forecast-Berechnungen mit den
 * Zahlen an, die das Frontend kompakt anzeigen will:
 *   - aktueller Monat (juengster Ist-Datensatz)
 *   - Plan-vs-Ist-Delta dieses Monats
 *   - Forecast-Marge der naechsten 3 Monate (Plan-Modus, da Trend noch nicht
 *     belastbar ist, wenn wenig Ist-Daten existieren)
 *   - Trend Umsatz/Kosten/Marge fuer 6 oder 12 Monate
 *   - Heatmap: deltaMarginPercent pro Monat
 *
 * Alle Werte stammen aus `PlanningScenario` + `PlanningActualMonthly`. Wird
 * keine `scenarioId` uebergeben, wird das zuletzt aktualisierte Szenario
 * verwendet — das deckt den haeufigen Fall „nur ein Plan in Pflege".
 */
@Injectable()
export class PlanningKpiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningService,
    private readonly baselines: PlanningBaselineService,
  ) {}

  async getDashboard(rangeMonths: number, scenarioId?: string) {
    const months = rangeMonths === 12 ? 12 : 6;
    const scenario = await this.pickScenario(scenarioId);
    if (!scenario) {
      return emptyDashboard(months);
    }

    const range = lastNYearMonths(months);
    const ranges = range.map(({ year, month }) => ({ year, month }));
    const actuals = await this.prisma.planningActualMonthly.findMany({
      where: { OR: ranges },
    });
    const actualByKey = new Map(
      actuals.map((a) => [ymKey(a.year, a.month), a]),
    );
    const plan = computeMonthlyPlan(scenario);

    const trend = range.map(({ year, month }) => {
      const a = actualByKey.get(ymKey(year, month));
      const actualRevenue = a?.actualRevenue ?? null;
      const actualCost = a?.actualCost ?? null;
      const actualMargin =
        actualRevenue != null && actualCost != null
          ? actualRevenue - actualCost
          : null;
      const deltaMargin =
        actualMargin != null ? actualMargin - plan.margin : null;
      const deltaMarginPercent =
        actualMargin != null && plan.margin !== 0
          ? ((actualMargin - plan.margin) / Math.abs(plan.margin)) * 100
          : null;
      const actualMarginPercent =
        actualMargin != null && actualRevenue && actualRevenue > 0
          ? (actualMargin / actualRevenue) * 100
          : null;
      return {
        year,
        month,
        planRevenue: plan.revenue,
        planCost: plan.cost,
        planMargin: plan.margin,
        actualRevenue,
        actualCost,
        actualMargin,
        actualMarginPercent,
        deltaMargin,
        deltaMarginPercent,
      };
    });

    // Juengster Ist-Monat in der Historie ermitteln (nicht der aktuelle
    // Kalendermonat, sondern der letzte mit echten Zahlen).
    const latestActual = [...trend].reverse().find((r) => r.actualMargin != null);

    const currentMonth = latestActual
      ? {
          year: latestActual.year,
          month: latestActual.month,
          revenue: latestActual.actualRevenue ?? 0,
          cost: latestActual.actualCost ?? 0,
          margin: latestActual.actualMargin ?? 0,
          marginPercent: latestActual.actualMarginPercent ?? 0,
        }
      : null;

    const planVsActualLatest = latestActual
      ? {
          year: latestActual.year,
          month: latestActual.month,
          planRevenue: latestActual.planRevenue,
          planMargin: latestActual.planMargin,
          actualRevenue: latestActual.actualRevenue ?? 0,
          actualMargin: latestActual.actualMargin ?? 0,
          deltaRevenue:
            (latestActual.actualRevenue ?? 0) - latestActual.planRevenue,
          deltaMargin: latestActual.deltaMargin ?? 0,
          deltaMarginPercent: latestActual.deltaMarginPercent ?? null,
        }
      : null;

    // Forecast naechste 3 Monate: Plan-Modus reicht fuer das Dashboard.
    const forecast = await this.planning.getForecast(scenario.id, 3, 'plan');
    const forecastNext3 = sumForecastMargin(forecast.points);

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      rangeMonths: months,
      currentMonth,
      planVsActualLatest,
      forecastNext3,
      plan: {
        revenue: plan.revenue,
        cost: plan.cost,
        margin: plan.margin,
        marginPercent: plan.marginPercent,
      },
      trend,
    };
  }

  // ── Hilfsfunktionen, die auch die Alert-Engine braucht ────────

  /**
   * Ist-Marge % im juengsten Monat mit Actuals — Basisgroesse fuer mehrere
   * Alert-Metriken. Liefert null, wenn es noch keine Actuals gibt.
   */
  async latestMarginPercent(): Promise<{
    year: number;
    month: number;
    marginPercent: number;
  } | null> {
    const a = await this.prisma.planningActualMonthly.findFirst({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    if (!a) return null;
    if (a.actualRevenue <= 0) {
      return { year: a.year, month: a.month, marginPercent: 0 };
    }
    return {
      year: a.year,
      month: a.month,
      marginPercent:
        ((a.actualRevenue - a.actualCost) / a.actualRevenue) * 100,
    };
  }

  /**
   * Delta Ist/Plan in % im juengsten Monat mit Actuals — fuer
   * deltaRevenuePercent / deltaCostPercent.
   */
  async latestDeltas(scenarioId?: string): Promise<{
    year: number;
    month: number;
    planRevenue: number;
    planCost: number;
    actualRevenue: number;
    actualCost: number;
    deltaRevenuePercent: number | null;
    deltaCostPercent: number | null;
  } | null> {
    const scenario = await this.pickScenario(scenarioId);
    if (!scenario) return null;
    const a = await this.prisma.planningActualMonthly.findFirst({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    if (!a) return null;
    const plan = computeMonthlyPlan(scenario);
    const deltaRev =
      plan.revenue !== 0
        ? ((a.actualRevenue - plan.revenue) / plan.revenue) * 100
        : null;
    const deltaCost =
      plan.cost !== 0
        ? ((a.actualCost - plan.cost) / plan.cost) * 100
        : null;
    return {
      year: a.year,
      month: a.month,
      planRevenue: plan.revenue,
      planCost: plan.cost,
      actualRevenue: a.actualRevenue,
      actualCost: a.actualCost,
      deltaRevenuePercent: deltaRev,
      deltaCostPercent: deltaCost,
    };
  }

  /**
   * Anzahl der juengsten zusammenhaengenden Monate mit negativer Ist-Marge.
   * Fuer die `negativeMarginStreak`-Metrik. Beruht auf Sortierung year DESC,
   * month DESC und bricht beim ersten nicht-negativen Monat ab.
   */
  async negativeMarginStreak(): Promise<{
    streak: number;
    lastYear: number;
    lastMonth: number;
  } | null> {
    const recent = await this.prisma.planningActualMonthly.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 24,
    });
    if (recent.length === 0) return null;
    let streak = 0;
    for (const a of recent) {
      const margin = a.actualRevenue - a.actualCost;
      if (margin < 0) streak++;
      else break;
    }
    if (streak === 0) {
      return { streak: 0, lastYear: recent[0].year, lastMonth: recent[0].month };
    }
    return {
      streak,
      lastYear: recent[0].year,
      lastMonth: recent[0].month,
    };
  }

  async pickScenario(scenarioId?: string) {
    if (scenarioId) {
      const s = await this.prisma.planningScenario.findUnique({
        where: { id: scenarioId },
      });
      if (!s) {
        throw new NotFoundException('Szenario nicht gefunden.');
      }
      return s;
    }
    // Phase 7: Baseline-Fallback. Wenn keine scenarioId angegeben wurde,
    // nutzt das Dashboard die zuletzt gesetzte aktive Baseline. Erst wenn
    // gar keine Baseline existiert, faellt es auf "juengstes Szenario"
    // zurueck — das alte Verhalten.
    const baselineScenarioId = await this.baselines.resolveBaselineScenarioId(
      {},
    );
    if (baselineScenarioId) {
      return this.prisma.planningScenario.findUnique({
        where: { id: baselineScenarioId },
      });
    }
    return this.prisma.planningScenario.findFirst({
      orderBy: [{ updatedAt: 'desc' }],
    });
  }
}

function emptyDashboard(months: number) {
  return {
    scenarioId: null as string | null,
    scenarioName: null as string | null,
    rangeMonths: months,
    currentMonth: null,
    planVsActualLatest: null,
    forecastNext3: { revenue: 0, cost: 0, margin: 0 },
    plan: { revenue: 0, cost: 0, margin: 0, marginPercent: 0 },
    trend: [],
  };
}

function sumForecastMargin(
  points: Array<{ revenue: number; cost: number; margin: number }>,
) {
  let revenue = 0;
  let cost = 0;
  let margin = 0;
  for (const p of points) {
    revenue += p.revenue;
    cost += p.cost;
    margin += p.margin;
  }
  return { revenue, cost, margin };
}

function lastNYearMonths(n: number) {
  const out: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

function ymKey(year: number, month: number) {
  return `${year}-${month}`;
}

type ScenarioForPlan = {
  weeksPerMonth: number;
  teamsPerWeek: number;
  workersPerTeam: number;
  regularHoursPerWorkerWeek: number;
  overtimeHoursPerWorkerWeek: number;
  regularRatePerHour: number;
  overtimeRatePerHour: number;
  costPerWorkerWeek: number;
};

function computeMonthlyPlan(s: ScenarioForPlan) {
  const weeks = s.weeksPerMonth || DEFAULT_WEEKS_PER_MONTH;
  const workers = s.teamsPerWeek * s.workersPerTeam;
  const revenue =
    workers *
    weeks *
    (s.regularHoursPerWorkerWeek * s.regularRatePerHour +
      s.overtimeHoursPerWorkerWeek * s.overtimeRatePerHour);
  const cost = workers * weeks * s.costPerWorkerWeek;
  const margin = revenue - cost;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
  return { revenue, cost, margin, marginPercent };
}
