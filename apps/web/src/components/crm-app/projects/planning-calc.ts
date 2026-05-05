/**
 * Reine Berechnungslogik fuer das Ertragsplanungs-Tool.
 *
 * Bewusst frei von React/IO/i18n, damit Editor, Vergleich und potenzielle
 * Server-Previews dasselbe Ergebnis liefern. Eingaben werden defensiv auf
 * nicht-negative Zahlen gezwungen, sodass auch invalides UI-Input nicht in
 * NaN/negativen Margenanzeigen endet.
 */

export type PlanningInputs = {
  teamsPerWeek: number;
  workersPerTeam: number;
  costPerWorkerWeek: number;
  regularHoursPerWorkerWeek: number;
  overtimeHoursPerWorkerWeek: number;
  regularRatePerHour: number;
  overtimeRatePerHour: number;
  /** Wochen pro Monat (Konvention 4.33). Wird auf 1..6 begrenzt. */
  weeksPerMonth: number;
};

export const DEFAULT_PLANNING_INPUTS: PlanningInputs = {
  teamsPerWeek: 4,
  workersPerTeam: 2,
  costPerWorkerWeek: 1200,
  regularHoursPerWorkerWeek: 40,
  overtimeHoursPerWorkerWeek: 5,
  regularRatePerHour: 65,
  overtimeRatePerHour: 80,
  weeksPerMonth: 4.33,
};

export type PeriodKey = "weekly" | "monthly" | "quarterly" | "halfYear";

export type PeriodResult = {
  revenue: number;
  cost: number;
  margin: number;
  /** Marge / Umsatz, in Prozent. 0 wenn Umsatz <= 0. */
  marginPercent: number;
};

export type PlanningResult = {
  workersTotal: number;
  revenuePerWorkerWeek: number;
  weekly: PeriodResult;
  monthly: PeriodResult;
  quarterly: PeriodResult;
  halfYear: PeriodResult;
  /** Marge in Prozent — periodenunabhaengig identisch (Verhaeltnis). */
  marginPercent: number;
};

/** Auf nicht-negative Zahl zwingen; Strings → number; NaN → 0. */
function nonNeg(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Sanitize Inputs (negative Werte → 0, weeksPerMonth in [1, 6], Default 4.33). */
export function normalizePlanningInputs(
  raw: Partial<PlanningInputs> | null | undefined,
): PlanningInputs {
  return {
    teamsPerWeek: nonNeg(raw?.teamsPerWeek),
    workersPerTeam: nonNeg(raw?.workersPerTeam),
    costPerWorkerWeek: nonNeg(raw?.costPerWorkerWeek),
    regularHoursPerWorkerWeek: nonNeg(raw?.regularHoursPerWorkerWeek),
    overtimeHoursPerWorkerWeek: nonNeg(raw?.overtimeHoursPerWorkerWeek),
    regularRatePerHour: nonNeg(raw?.regularRatePerHour),
    overtimeRatePerHour: nonNeg(raw?.overtimeRatePerHour),
    weeksPerMonth: clamp(
      typeof raw?.weeksPerMonth === "number" && Number.isFinite(raw.weeksPerMonth)
        ? raw.weeksPerMonth
        : DEFAULT_PLANNING_INPUTS.weeksPerMonth,
      1,
      6,
    ),
  };
}

function periodResult(
  weekly: { revenue: number; cost: number; margin: number },
  factor: number,
): PeriodResult {
  const revenue = weekly.revenue * factor;
  const cost = weekly.cost * factor;
  const margin = weekly.margin * factor;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
  return { revenue, cost, margin, marginPercent };
}

/** Hauptberechnung — gleiche Logik fuer Editor, Liste und Vergleich. */
export function calculatePlanning(input: PlanningInputs): PlanningResult {
  const safe = normalizePlanningInputs(input);
  const workersTotal = safe.teamsPerWeek * safe.workersPerTeam;
  const revenuePerWorkerWeek =
    safe.regularHoursPerWorkerWeek * safe.regularRatePerHour +
    safe.overtimeHoursPerWorkerWeek * safe.overtimeRatePerHour;
  const weeklyRevenue = workersTotal * revenuePerWorkerWeek;
  const weeklyCost = workersTotal * safe.costPerWorkerWeek;
  const weeklyMargin = weeklyRevenue - weeklyCost;

  const weekly: PeriodResult = {
    revenue: weeklyRevenue,
    cost: weeklyCost,
    margin: weeklyMargin,
    marginPercent: weeklyRevenue > 0 ? (weeklyMargin / weeklyRevenue) * 100 : 0,
  };
  const monthly = periodResult(weekly, safe.weeksPerMonth);
  const quarterly = periodResult(weekly, safe.weeksPerMonth * 3);
  const halfYear = periodResult(weekly, safe.weeksPerMonth * 6);

  return {
    workersTotal,
    revenuePerWorkerWeek,
    weekly,
    monthly,
    quarterly,
    halfYear,
    marginPercent: weekly.marginPercent,
  };
}

export type PlanningTargets = {
  targetMonthlyRevenue?: number | null;
  targetMonthlyMargin?: number | null;
  targetMarginPercent?: number | null;
};

export type PlanningScenarioApi = PlanningTargets & {
  id: string;
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
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  createdBy?: { id: string; displayName: string; email: string } | null;
  // Phase 7: workflow + multi-Standort.
  status?: ScenarioStatus;
  rejectionReason?: string | null;
  locationId?: string | null;
  businessUnitId?: string | null;
  location?: PlanningOrgRefApi | null;
  businessUnit?: PlanningOrgRefApi | null;
};

export type ScenarioStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED";

export type DecisionAction =
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "ARCHIVE"
  | "UNARCHIVE"
  | "SET_BASELINE"
  | "UNSET_BASELINE";

export type PlanningOrgRefApi = {
  id: string;
  name: string;
  code: string;
  active?: boolean;
};

export type PlanningDecisionLogApi = {
  id: string;
  scenarioId: string;
  action: DecisionAction;
  comment: string | null;
  createdAt: string;
  actor?: { id: string; displayName: string; email?: string } | null;
};

export type PlanningBaselinePeriodType = "MONTH" | "QUARTER" | "YEAR";

export type PlanningBaselineApi = {
  id: string;
  scenarioId: string;
  locationId: string | null;
  businessUnitId: string | null;
  periodType: PlanningBaselinePeriodType;
  periodRef: string;
  active: boolean;
  setAt: string;
  scenario?: { id: string; name: string; status: ScenarioStatus } | null;
  location?: PlanningOrgRefApi | null;
  businessUnit?: PlanningOrgRefApi | null;
  setBy?: { id: string; displayName: string } | null;
};

// ── Phase 8: Budget + Cashflow + Finanz-KPIs ──────────────────────

export type CostType = "OPEX" | "CAPEX";
export type BudgetFrequency = "ONE_TIME" | "MONTHLY" | "QUARTERLY";

export type PlanningBudgetItemApi = {
  id: string;
  scenarioId: string;
  category: string;
  name: string;
  costType: CostType;
  amount: number;
  frequency: BudgetFrequency;
  startDate: string;
  endDate: string | null;
  locationId: string | null;
  businessUnitId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanningCashflowConfigApi = {
  id: string;
  scenarioId: string;
  startingCash: number;
  revenueDelayDays: number;
  expenseDelayDays: number;
};

export type CashflowMonthApi = {
  year: number;
  month: number;
  cashIn: number;
  cashOutOpex: number;
  cashOutCapex: number;
  cashOutTotal: number;
  netCashflow: number;
  cumulativeCash: number;
};

export type CashflowProjectionApi = {
  scenarioId: string;
  startingCash: number;
  revenueDelayDays: number;
  expenseDelayDays: number;
  rangeMonths: number;
  months: CashflowMonthApi[];
  minCumulativeCash: number;
  minCumulativeCashAtIndex: number;
  totals: {
    cashIn: number;
    cashOutOpex: number;
    cashOutCapex: number;
    cashOutTotal: number;
    netCashflow: number;
  };
};

export type FinancialKpisApi = {
  scenarioId: string;
  rangeMonths: number;
  monthlyPlan: { revenue: number; cost: number; operatingResult: number };
  budgetTotals: {
    opex: number;
    capex: number;
    total: number;
    capexShare: number;
  };
  operatingResult: number;
  totalResult: number;
};

// ── Phase 9: Kapazitaet + Auslastung ─────────────────────────────

export type CapacityProfileApi = {
  id: string | null;
  scenarioId: string;
  weeklyTargetHours: number;
  availabilityFactor: number;
  productivityFactor: number;
  availableHoursPerWorkerWeek: number;
  workersPerTeam: number;
  teamsPerWeek: number;
  availableHoursPerTeamWeek: number;
  availableHoursWeekTotal: number;
  demandHoursWeek: number;
  capacityDeltaWeek: number;
  utilizationPercentWeek: number;
};

export type UtilizationStatus = "green" | "yellow" | "red";

export type UtilizationWeekApi = {
  isoYear: number;
  isoWeek: number;
  weekStart: string;
  availableHours: number;
  demandHours: number;
  deltaHours: number;
  utilizationPercent: number;
  status: UtilizationStatus;
};

export type UtilizationProjectionApi = {
  scenarioId: string;
  weeks: UtilizationWeekApi[];
  averageUtilizationPercent: number;
  peakUtilizationPercent: number;
  weeksOverThreshold: number;
  minDeltaHours: number;
};

export type BottleneckApi = {
  weekStart: string;
  isoYear: number;
  isoWeek: number;
  utilizationPercent: number;
  shortfallHours: number;
  additionalTeams: number;
  additionalWorkerHours: number;
};

export type BottlenecksApi = {
  scenarioId: string;
  thresholdPercent: number;
  weeks: BottleneckApi[];
  suggestion: string | null;
};

// ── Phase 10: Pipeline ──────────────────────────────────────────

export type PipelineStage =
  | "LEAD"
  | "QUALIFIED"
  | "OFFERED"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export type PipelineScenario = "base" | "best" | "worst";

export type PipelineRange = "month" | "quarter" | "halfyear";

export type PlanningPipelineItemApi = {
  id: string;
  title: string;
  customerId: string | null;
  projectId: string | null;
  ownerUserId: string | null;
  stage: PipelineStage;
  amountTotal: number;
  winProbability: number;
  expectedStartDate: string;
  expectedEndDate: string | null;
  expectedWeeklyHours: number | null;
  locationId: string | null;
  businessUnitId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: { id: string; displayName: string; email: string } | null;
};

export type PipelineForecastBucket = {
  periodRef: string;
  weightedAmount: number;
  totalAmount: number;
  itemCount: number;
};

export type PipelineForecastResult = {
  scenario: PipelineScenario;
  range: PipelineRange;
  buckets: PipelineForecastBucket[];
  totals: {
    totalAmount: number;
    weightedAmount: number;
    wonAmount: number;
    earlyStageWeightedShare: number;
    expectedWeeklyHours: number;
  };
  byStage: Array<{
    stage: PipelineStage;
    itemCount: number;
    totalAmount: number;
    weightedAmount: number;
  }>;
};

/** Aus API-Daten die Eingabe-Untermenge extrahieren. */
export function scenarioToInputs(s: PlanningScenarioApi): PlanningInputs {
  return normalizePlanningInputs(s);
}

// ── Phase 4: Actuals / Versionen / Forecast ──────────────────────

export type PlanningActualApi = {
  id: string;
  year: number;
  month: number;
  actualRevenue: number;
  actualCost: number;
  actualHours: number | null;
  actualOvertimeHours: number | null;
  source: "manual" | "import";
  note: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; displayName: string; email: string } | null;
};

export type PlanningVersionApi = {
  id: string;
  scenarioId: string;
  versionNumber: number;
  snapshotJson: Record<string, unknown>;
  changeNote: string | null;
  changedByUserId: string | null;
  changedAt: string;
  changedBy?: { id: string; displayName: string; email: string } | null;
};

export type PlanVsActualRow = {
  year: number;
  month: number;
  planRevenue: number;
  planCost: number;
  planMargin: number;
  actualRevenue: number | null;
  actualCost: number | null;
  actualMargin: number | null;
  deltaRevenue: number | null;
  deltaCost: number | null;
  deltaMargin: number | null;
  deltaRevenuePercent: number | null;
  deltaMarginPercent: number | null;
  actualSource: string | null;
};

export type PlanVsActualResponse = {
  scenarioId: string;
  plan: { revenue: number; cost: number; margin: number; marginPercent: number };
  rows: PlanVsActualRow[];
};

export type ForecastResponse = {
  scenarioId: string;
  mode: "plan" | "trend";
  basis: { revenue: number; cost: number } | null;
  simplifiedNote: string;
  points: Array<{
    year: number;
    month: number;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
  }>;
};

// ── Phase 5: CSV-Import ──────────────────────────────────────────

export type DuplicateStrategy = "skip" | "overwrite";

export type ImportRowAction = "create" | "overwrite" | "skip";

export type ImportParseError = {
  rowNumber: number;
  code: string;
  message: string;
  raw?: string;
};

export type ImportRowPreview = {
  rowNumber: number;
  action: ImportRowAction;
  reason?: string;
  candidate: {
    rowNumber: number;
    year: number;
    month: number;
    actualRevenue: number;
    actualCost: number;
    actualHours?: number | null;
    actualOvertimeHours?: number | null;
    source?: string | null;
    note?: string | null;
  };
  existing?: {
    id: string;
    actualRevenue: number;
    actualCost: number;
    source: string;
    note: string | null;
  };
};

export type ImportDryRunResponse = {
  jobId: string;
  status: "succeeded" | "partial" | "failed";
  duplicateStrategy: DuplicateStrategy;
  summary: {
    total: number;
    toCreate: number;
    toOverwrite: number;
    toSkip: number;
    errors: number;
  };
  rows: ImportRowPreview[];
  errorReport: ImportParseError[];
};

export type ImportCommitResponse = {
  jobId: string;
  status: "succeeded" | "partial" | "failed";
  duplicateStrategy: DuplicateStrategy;
  summary: {
    total: number;
    created: number;
    overwritten: number;
    skipped: number;
    errors: number;
  };
  errorReport: ImportParseError[];
};

export type PlanningImportJobApi = {
  id: string;
  type: string;
  mode: "dry-run" | "commit";
  status: "succeeded" | "partial" | "failed";
  duplicateStrategy: DuplicateStrategy;
  filename: string | null;
  totalRows: number;
  successRows: number;
  skippedRows: number;
  errorRows: number;
  startedAt: string;
  finishedAt: string | null;
  createdBy: { id: string; displayName: string; email: string } | null;
};

export type PlanningImportJobDetail = PlanningImportJobApi & {
  errorReport: ImportParseError[];
};

// ── Phase 6: KPI Dashboard + Alerts ──────────────────────────────

export type KpiTrendPoint = {
  year: number;
  month: number;
  planRevenue: number;
  planCost: number;
  planMargin: number;
  actualRevenue: number | null;
  actualCost: number | null;
  actualMargin: number | null;
  actualMarginPercent: number | null;
  deltaMargin: number | null;
  deltaMarginPercent: number | null;
};

export type KpiDashboard = {
  scenarioId: string | null;
  scenarioName: string | null;
  rangeMonths: 6 | 12;
  currentMonth: {
    year: number;
    month: number;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
  } | null;
  planVsActualLatest: {
    year: number;
    month: number;
    planRevenue: number;
    planMargin: number;
    actualRevenue: number;
    actualMargin: number;
    deltaRevenue: number;
    deltaMargin: number;
    deltaMarginPercent: number | null;
  } | null;
  forecastNext3: { revenue: number; cost: number; margin: number };
  plan: { revenue: number; cost: number; margin: number; marginPercent: number };
  trend: KpiTrendPoint[];
};

export type AlertMetric =
  | "marginPercent"
  | "deltaRevenuePercent"
  | "deltaCostPercent"
  | "negativeMarginStreak"
  | "cashBalance"
  | "negativeCashflowStreak"
  | "capexShare"
  | "utilizationPercent"
  | "capacityDeltaHours"
  | "overloadWeeksStreak"
  | "pipelineWeighted"
  | "pipelineEarlyStageShare";

export type AlertOperator = "lt" | "lte" | "gt" | "gte";

export type AlertSeverity = "INFO" | "WARN" | "CRITICAL";

export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type PlanningAlertRuleApi = {
  id: string;
  name: string;
  scenarioId: string | null;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  consecutiveMonths: number;
  severity: AlertSeverity;
  channelInApp: boolean;
  channelEmail: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  scenario?: { id: string; name: string } | null;
  createdBy?: { id: string; displayName: string; email: string } | null;
};

export type PlanningAlertApi = {
  id: string;
  ruleId: string;
  status: AlertStatus;
  severity: AlertSeverity;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  metricValue: number;
  thresholdValue: number;
  dedupeKey: string;
  contextJson: Record<string, unknown> | null;
  rule?: {
    id: string;
    name: string;
    metric: AlertMetric;
    operator: AlertOperator;
    threshold: number;
    severity: AlertSeverity;
    scenarioId: string | null;
  } | null;
  acknowledgedBy?: { id: string; displayName: string } | null;
  resolvedBy?: { id: string; displayName: string } | null;
};

export type AlertEvaluateResult = {
  startedAt: string;
  finishedAt: string;
  rulesChecked: number;
  alertsCreated: number;
  rules: Array<{
    ruleId: string;
    name: string;
    metric: AlertMetric;
    triggered: boolean;
    metricValue: number | null;
    thresholdValue: number;
    dedupeKey: string;
    context: Record<string, unknown>;
    alertId?: string;
    outcome: "created" | "deduped" | "skipped";
  }>;
};

// ── Break-even & Sensitivity ─────────────────────────────────────

export type BreakEvenInfo = {
  /**
   * Per-Worker-Marge pro Woche bei aktuellen Hours/Rates/Cost.
   * < 0  → kein Team-Setup erreicht Marge >= 0 (nur Rate/Kosten ändern hilft)
   * = 0  → exakter Break-even unabhaengig der Teamgroesse
   * > 0  → Marge >= 0 schon ab dem ersten Monteur
   */
  perWorkerWeeklyMargin: number;
  /** Status fuer die UI-Sprache: profitable / breakeven / unreachable. */
  status: "profitable" | "breakeven" | "unreachable";
  /**
   * Mindestanzahl Teams/Woche, um Wochen-Marge >= 0 zu erreichen, gegeben
   * der aktuelle Pro-Worker-Wert. Im linearen Modell:
   *   - profitable  → 1 (jedes positive Team-Setup reicht)
   *   - breakeven   → 1 (Marge bleibt 0, jede positive Teamzahl gilt)
   *   - unreachable → null
   */
  requiredTeams: number | null;
  /**
   * Notwendiger regulaerer Stundensatz, damit per-Worker-Marge = 0 — bei
   * sonst gleichen Annahmen (Stunden, Ueberstundensatz, Kosten/Woche).
   * Liefert null, wenn `regularHoursPerWorkerWeek <= 0` (Formel undefiniert).
   */
  requiredRegularRate: number | null;
  /**
   * Maximale Kostenobergrenze pro Monteur und Woche, ab der die Marge
   * negativ wird (umgekehrte Sicht).
   */
  maxCostPerWorkerWeek: number;
};

export function breakEven(input: PlanningInputs): BreakEvenInfo {
  const safe = normalizePlanningInputs(input);
  const revenuePerWorkerWeek =
    safe.regularHoursPerWorkerWeek * safe.regularRatePerHour +
    safe.overtimeHoursPerWorkerWeek * safe.overtimeRatePerHour;
  const perWorkerWeeklyMargin = revenuePerWorkerWeek - safe.costPerWorkerWeek;
  let status: BreakEvenInfo["status"] = "profitable";
  if (perWorkerWeeklyMargin < 0) status = "unreachable";
  else if (perWorkerWeeklyMargin === 0) status = "breakeven";
  const requiredTeams = perWorkerWeeklyMargin < 0 ? null : 1;
  const requiredRegularRate =
    safe.regularHoursPerWorkerWeek > 0
      ? Math.max(
          0,
          (safe.costPerWorkerWeek -
            safe.overtimeHoursPerWorkerWeek * safe.overtimeRatePerHour) /
            safe.regularHoursPerWorkerWeek,
        )
      : null;
  return {
    perWorkerWeeklyMargin,
    status,
    requiredTeams,
    requiredRegularRate,
    maxCostPerWorkerWeek: revenuePerWorkerWeek,
  };
}

export type SensitivityVariable = "teamsPerWeek" | "regularRatePerHour" | "costPerWorkerWeek";

export type SensitivityPoint = {
  variableValue: number;
  workersTotal: number;
  weeklyMargin: number;
  monthlyMargin: number;
  marginPercent: number;
};

export type SensitivityResult = {
  variable: SensitivityVariable;
  points: SensitivityPoint[];
  best: SensitivityPoint;
  worst: SensitivityPoint;
};

export function sensitivity(
  input: PlanningInputs,
  variable: SensitivityVariable,
  range: { min: number; max: number; steps: number },
): SensitivityResult {
  const safe = normalizePlanningInputs(input);
  const steps = Math.max(2, Math.min(20, Math.floor(range.steps)));
  const min = Math.max(0, range.min);
  const max = Math.max(min, range.max);
  const points: SensitivityPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const value = min + (max - min) * t;
    const variant = { ...safe, [variable]: value } as PlanningInputs;
    const calc = calculatePlanning(variant);
    points.push({
      variableValue: value,
      workersTotal: calc.workersTotal,
      weeklyMargin: calc.weekly.margin,
      monthlyMargin: calc.monthly.margin,
      marginPercent: calc.marginPercent,
    });
  }
  const sortedByMargin = [...points].sort(
    (a, b) => a.monthlyMargin - b.monthlyMargin,
  );
  return {
    variable,
    points,
    best: sortedByMargin[sortedByMargin.length - 1],
    worst: sortedByMargin[0],
  };
}

// ── Targets / Ist-vs-Ziel ───────────────────────────────────────

export type TargetCheckLevel = "ok" | "warn" | "fail" | "none";

export type TargetCheck = {
  level: TargetCheckLevel;
  /** Differenz Ist - Ziel; positiv = Ziel uebertroffen. */
  delta: number;
  /** Ratio Ist / Ziel als Faktor (1.0 = exakt erfuellt). 0 wenn Ziel <= 0. */
  ratio: number;
};

function levelByRatio(ratio: number, isCostLike: boolean): TargetCheckLevel {
  // Fuer Umsatz/Marge: hoeher ist besser
  // Fuer "isCostLike" (z. B. Soll-Marge in % bei niedrigeren Werten schlechter): identisch.
  // Schwellen: >= 1.0 ok, >= 0.85 warn, sonst fail.
  if (!Number.isFinite(ratio)) return "none";
  if (isCostLike) {
    if (ratio <= 1) return "ok";
    if (ratio <= 1.15) return "warn";
    return "fail";
  }
  if (ratio >= 1) return "ok";
  if (ratio >= 0.85) return "warn";
  return "fail";
}

export function evaluateTargets(
  result: PlanningResult,
  targets: PlanningTargets,
) {
  const ist = result.monthly;
  function check(
    actual: number,
    target: number | null | undefined,
  ): TargetCheck {
    if (target == null) return { level: "none", delta: 0, ratio: 0 };
    const delta = actual - target;
    const ratio = target !== 0 ? actual / target : 0;
    return { level: levelByRatio(ratio, false), delta, ratio };
  }
  return {
    monthlyRevenue: check(ist.revenue, targets.targetMonthlyRevenue),
    monthlyMargin: check(ist.margin, targets.targetMonthlyMargin),
    marginPercent: check(result.marginPercent, targets.targetMarginPercent),
  };
}
