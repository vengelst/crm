import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatchCashflowConfigDto } from './dto';

const DEFAULT_WEEKS_PER_MONTH = 4.33;

export type CashflowMonth = {
  year: number;
  month: number;
  cashIn: number;
  cashOutOpex: number;
  cashOutCapex: number;
  cashOutTotal: number;
  netCashflow: number;
  cumulativeCash: number;
};

export type CashflowProjection = {
  scenarioId: string;
  startingCash: number;
  revenueDelayDays: number;
  expenseDelayDays: number;
  rangeMonths: number;
  months: CashflowMonth[];
  /** Niedrigster `cumulativeCash` im Horizont — Risk-Indicator. */
  minCumulativeCash: number;
  /** Index des `minCumulativeCash`-Monats in `months`, oder -1 wenn leer. */
  minCumulativeCashAtIndex: number;
  totals: {
    cashIn: number;
    cashOutOpex: number;
    cashOutCapex: number;
    cashOutTotal: number;
    netCashflow: number;
  };
};

export type FinancialKpis = {
  scenarioId: string;
  rangeMonths: number;
  /** Plan-Marge (operativ, ohne Capex). */
  monthlyPlan: {
    revenue: number;
    cost: number;
    operatingResult: number;
  };
  budgetTotals: {
    /** Summe aller OPEX-Posten ueber `rangeMonths`. */
    opex: number;
    /** Summe aller CAPEX-Posten ueber `rangeMonths`. */
    capex: number;
    total: number;
    /** capex / total in Prozent (0 wenn total=0). */
    capexShare: number;
  };
  /** Operatives Ergebnis = Plan-Marge - Opex (laufende Posten ohne Capex). */
  operatingResult: number;
  /** Gesamtergebnis = operatives Ergebnis - Capex. */
  totalResult: number;
};

/**
 * Berechnet die Monats-Liquiditaetsvorschau plus Finanz-KPIs.
 *
 * Cash-in:    Plan-Umsatz pro Monat (aus Szenario-Eingaben). Verzoegerung
 *             ueber `revenueDelayDays` wird in volle Monate gerundet
 *             (>= 30 Tage = 1 Monat) und schiebt die Eingaenge nach hinten.
 * Cash-out:   Operating Costs aus Szenario (kostenseitig analog Plan-Marge)
 *             plus alle Budget-Posten, die im jeweiligen Monat aktiv sind.
 *             Trennung OPEX/CAPEX folgt der Kostenart.
 *
 * `frequency` Interpretation:
 *   ONE_TIME    — wirkt nur im `startDate`-Monat
 *   MONTHLY     — jeden Monat zwischen startDate (inkl.) und endDate (inkl./offen)
 *   QUARTERLY   — jeden 3. Monat ab startDate
 */
@Injectable()
export class PlanningCashflowService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Konfiguration laden / aktualisieren ──────────────────────

  async getConfig(scenarioId: string) {
    await this.assertScenario(scenarioId);
    const cfg = await this.prisma.planningCashflowConfig.findUnique({
      where: { scenarioId },
    });
    if (cfg) return cfg;
    // Default-Eintrag synchron erzeugen, damit der UI-Editor immer eine
    // Resource zum patchen hat.
    return this.prisma.planningCashflowConfig.create({
      data: { scenarioId },
    });
  }

  async updateConfig(scenarioId: string, dto: PatchCashflowConfigDto) {
    await this.assertScenario(scenarioId);
    return this.prisma.planningCashflowConfig.upsert({
      where: { scenarioId },
      update: {
        ...(dto.startingCash !== undefined
          ? { startingCash: dto.startingCash }
          : {}),
        ...(dto.revenueDelayDays !== undefined
          ? { revenueDelayDays: dto.revenueDelayDays }
          : {}),
        ...(dto.expenseDelayDays !== undefined
          ? { expenseDelayDays: dto.expenseDelayDays }
          : {}),
      },
      create: {
        scenarioId,
        startingCash: dto.startingCash ?? 0,
        revenueDelayDays: dto.revenueDelayDays ?? 0,
        expenseDelayDays: dto.expenseDelayDays ?? 0,
      },
    });
  }

  // ── Projektion ────────────────────────────────────────────────

  async getCashflow(
    scenarioId: string,
    rangeMonths: number,
  ): Promise<CashflowProjection> {
    const scenario = await this.assertScenario(scenarioId);
    const months = Math.max(1, Math.min(24, rangeMonths || 6));
    const cfg = await this.getConfig(scenarioId);
    const items = await this.prisma.planningBudgetItem.findMany({
      where: { scenarioId },
    });

    const plan = computeMonthlyPlan(scenario);
    const yearMonthList = nextNYearMonths(months);
    const revenueShift = monthsFromDays(cfg.revenueDelayDays);
    const expenseShift = monthsFromDays(cfg.expenseDelayDays);

    const out: CashflowMonth[] = [];
    let cumulative = cfg.startingCash;
    let totalIn = 0;
    let totalOpex = 0;
    let totalCapex = 0;

    let minCum = cfg.startingCash;
    let minIdx = -1;

    yearMonthList.forEach((ym, idx) => {
      // Cash-in: Plan-Umsatz, eventuell um `revenueShift` Monate nach hinten
      // verschoben (heisst: der Eingang faellt in Monat idx aus dem Umsatz von
      // Monat idx - revenueShift). Vorher = 0.
      const cashIn = idx - revenueShift >= 0 ? plan.revenue : 0;

      // Operative Standard-Kosten (aus Szenario) — ebenfalls verschiebbar.
      const baseOpexPerMonth = idx - expenseShift >= 0 ? plan.cost : 0;

      // Budgetposten in diesem Monat aufsummieren (mit Frequency-Logik).
      let budgetOpex = 0;
      let budgetCapex = 0;
      for (const item of items) {
        const amountForMonth = budgetItemAmountForMonth(item, ym, expenseShift);
        if (amountForMonth === 0) continue;
        if (item.costType === 'CAPEX') budgetCapex += amountForMonth;
        else budgetOpex += amountForMonth;
      }

      const cashOutOpex = baseOpexPerMonth + budgetOpex;
      const cashOutCapex = budgetCapex;
      const cashOutTotal = cashOutOpex + cashOutCapex;
      const netCashflow = cashIn - cashOutTotal;
      cumulative += netCashflow;

      if (cumulative < minCum) {
        minCum = cumulative;
        minIdx = idx;
      }

      out.push({
        year: ym.year,
        month: ym.month,
        cashIn,
        cashOutOpex,
        cashOutCapex,
        cashOutTotal,
        netCashflow,
        cumulativeCash: cumulative,
      });
      totalIn += cashIn;
      totalOpex += cashOutOpex;
      totalCapex += cashOutCapex;
    });

    return {
      scenarioId,
      startingCash: cfg.startingCash,
      revenueDelayDays: cfg.revenueDelayDays,
      expenseDelayDays: cfg.expenseDelayDays,
      rangeMonths: months,
      months: out,
      minCumulativeCash: minCum,
      minCumulativeCashAtIndex: minIdx,
      totals: {
        cashIn: totalIn,
        cashOutOpex: totalOpex,
        cashOutCapex: totalCapex,
        cashOutTotal: totalOpex + totalCapex,
        netCashflow: totalIn - (totalOpex + totalCapex),
      },
    };
  }

  // ── Finanz-KPIs (Phase 8 Aggregat) ───────────────────────────

  async getFinancialKpis(
    scenarioId: string,
    rangeMonths: number,
  ): Promise<FinancialKpis> {
    const scenario = await this.assertScenario(scenarioId);
    const months = Math.max(1, Math.min(24, rangeMonths || 6));
    const items = await this.prisma.planningBudgetItem.findMany({
      where: { scenarioId },
    });
    const plan = computeMonthlyPlan(scenario);

    let opex = 0;
    let capex = 0;
    const yearMonthList = nextNYearMonths(months);
    for (const ym of yearMonthList) {
      for (const item of items) {
        const amount = budgetItemAmountForMonth(item, ym, 0);
        if (item.costType === 'CAPEX') capex += amount;
        else opex += amount;
      }
    }

    const operatingResult = plan.margin * months - opex;
    const totalResult = operatingResult - capex;
    const total = opex + capex;
    const capexShare = total > 0 ? (capex / total) * 100 : 0;

    return {
      scenarioId,
      rangeMonths: months,
      monthlyPlan: {
        revenue: plan.revenue,
        cost: plan.cost,
        operatingResult: plan.margin,
      },
      budgetTotals: {
        opex,
        capex,
        total,
        capexShare,
      },
      operatingResult,
      totalResult,
    };
  }

  private async assertScenario(id: string) {
    const s = await this.prisma.planningScenario.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Szenario nicht gefunden.');
    return s;
  }
}

// ── Hilfsfunktionen ────────────────────────────────────────────

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
  return { revenue, cost, margin: revenue - cost };
}

function nextNYearMonths(n: number) {
  const out: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

function monthsFromDays(days: number): number {
  if (days <= 0) return 0;
  return Math.round(days / 30);
}

type BudgetItemRow = {
  costType: string;
  amount: number;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
};

/**
 * Liefert den Betrag, mit dem ein Budgetposten in diesem Monat (year/month)
 * zu Buche schlaegt — abzgl. eines optionalen Verzoegerungs-Shifts.
 *
 * Implementierung greift auf Calendarvergleich zurueck (kein millisekunden-
 * basierter Vergleich, der bei Zeitzonen-Drift kippen kann).
 */
function budgetItemAmountForMonth(
  item: BudgetItemRow,
  ym: { year: number; month: number },
  shiftMonths: number,
): number {
  const target = ymToIndex(ym.year, ym.month) - shiftMonths;
  const start = ymToIndex(
    item.startDate.getFullYear(),
    item.startDate.getMonth() + 1,
  );
  const end = item.endDate
    ? ymToIndex(item.endDate.getFullYear(), item.endDate.getMonth() + 1)
    : Number.POSITIVE_INFINITY;
  if (target < start || target > end) return 0;
  if (item.frequency === 'ONE_TIME') {
    return target === start ? item.amount : 0;
  }
  if (item.frequency === 'QUARTERLY') {
    return (target - start) % 3 === 0 ? item.amount : 0;
  }
  // MONTHLY (Default)
  return item.amount;
}

function ymToIndex(year: number, month: number) {
  return year * 12 + (month - 1);
}
