import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createTransport } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PlanningKpiService } from '../kpi/planning-kpi.service';
import { PlanningCashflowService } from '../finance/planning-cashflow.service';
import { PlanningBaselineService } from '../workflow/planning-baseline.service';
import { PlanningCapacityService } from '../capacity/planning-capacity.service';
import { PlanningPipelineService } from '../pipeline/planning-pipeline.service';
import {
  ALERT_METRICS,
  ALERT_OPERATORS,
  AlertMetric,
  AlertOperator,
  AlertSeverity,
} from '../dto/planning-alert.dto';

const HOUR_MS = 60 * 60 * 1000;

type EvaluatedRule = {
  ruleId: string;
  name: string;
  metric: AlertMetric;
  triggered: boolean;
  metricValue: number | null;
  thresholdValue: number;
  dedupeKey: string;
  context: Record<string, unknown>;
  alertId?: string;
  /** Was wurde gemacht: created, deduped (kein neuer Alert), skipped (kein Wert). */
  outcome: 'created' | 'deduped' | 'skipped';
};

export type EvaluateResult = {
  startedAt: string;
  finishedAt: string;
  rulesChecked: number;
  alertsCreated: number;
  rules: EvaluatedRule[];
};

/**
 * Auswertungs-Engine fuer Alert-Regeln.
 *
 * Laeuft stuendlich via `@Interval`, kann aber auch manuell via Endpoint
 * angestossen werden. Jede aktive Regel wird gegen die aktuellen KPIs
 * geprueft; bei Verletzung wird ein Alert angelegt — sofern nicht schon
 * ein OPEN-Alert mit demselben Dedupe-Schluessel existiert.
 *
 * Notifikation:
 *   - In-App: `NotificationsService.notifyAdmins(...)` (Pflicht-Kanal)
 *   - E-Mail: nodemailer ueber die persistente `SmtpConfig` (optional)
 *
 * Fehler im Mailversand werden geloggt, brechen aber den Alert-Flow nicht
 * ab — der Alert bleibt OPEN, der Admin sieht ihn ueber In-App-Channel.
 */
@Injectable()
export class PlanningAlertEngineService {
  private readonly logger = new Logger(PlanningAlertEngineService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: PlanningKpiService,
    private readonly notifications: NotificationsService,
    private readonly cashflow: PlanningCashflowService,
    private readonly baselines: PlanningBaselineService,
    private readonly capacity: PlanningCapacityService,
    private readonly pipeline: PlanningPipelineService,
  ) {}

  @Interval(HOUR_MS)
  async scheduledEvaluate() {
    if (this.running) {
      this.logger.debug('Alert-Engine laeuft bereits, ueberspringe Tick.');
      return;
    }
    try {
      this.running = true;
      const result = await this.evaluate();
      if (result.alertsCreated > 0) {
        this.logger.log(
          `Alert-Engine Tick: ${result.alertsCreated} neue Alerts.`,
        );
      }
    } catch (e) {
      this.logger.warn(`Alert-Engine fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async evaluate(): Promise<EvaluateResult> {
    const startedAt = new Date();
    const rules = await this.prisma.planningAlertRule.findMany({
      where: { active: true },
    });
    const evaluations: EvaluatedRule[] = [];
    let alertsCreated = 0;
    for (const rule of rules) {
      const ev = await this.evaluateRule(rule);
      if (ev.outcome === 'created') alertsCreated++;
      evaluations.push(ev);
    }
    const finishedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      rulesChecked: rules.length,
      alertsCreated,
      rules: evaluations,
    };
  }

  private async evaluateRule(rule: {
    id: string;
    name: string;
    scenarioId: string | null;
    metric: string;
    operator: string;
    threshold: number;
    consecutiveMonths: number;
    severity: string;
    channelInApp: boolean;
    channelEmail: boolean;
  }): Promise<EvaluatedRule> {
    const metric = rule.metric as AlertMetric;
    const operator = rule.operator as AlertOperator;
    if (!ALERT_METRICS.includes(metric) || !ALERT_OPERATORS.includes(operator)) {
      return {
        ruleId: rule.id,
        name: rule.name,
        metric,
        triggered: false,
        metricValue: null,
        thresholdValue: rule.threshold,
        dedupeKey: 'invalid',
        context: { reason: 'unsupported metric/operator' },
        outcome: 'skipped',
      };
    }

    // Metrik berechnen + Dedupe-Schluessel + Kontext einsammeln.
    const sample = await this.computeMetric(metric, rule);
    if (sample == null) {
      return {
        ruleId: rule.id,
        name: rule.name,
        metric,
        triggered: false,
        metricValue: null,
        thresholdValue: rule.threshold,
        dedupeKey: 'no-data',
        context: { reason: 'no actuals available' },
        outcome: 'skipped',
      };
    }

    const triggered = compareOperator(sample.value, operator, rule.threshold);
    if (!triggered) {
      return {
        ruleId: rule.id,
        name: rule.name,
        metric,
        triggered: false,
        metricValue: sample.value,
        thresholdValue: rule.threshold,
        dedupeKey: sample.dedupeKey,
        context: sample.context,
        outcome: 'skipped',
      };
    }

    // Dedupe: gibt es einen noch nicht geloesten Alert mit gleichem
    // Schluessel? `ACKNOWLEDGED` zaehlt mit — der Admin hat die Warnung
    // bereits gesehen und arbeitet daran. Erst nach `RESOLVED` darf eine
    // erneute Verletzung wieder einen Alert ausloesen.
    const existing = await this.prisma.planningAlert.findFirst({
      where: {
        ruleId: rule.id,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        dedupeKey: sample.dedupeKey,
      },
    });
    if (existing) {
      return {
        ruleId: rule.id,
        name: rule.name,
        metric,
        triggered: true,
        metricValue: sample.value,
        thresholdValue: rule.threshold,
        dedupeKey: sample.dedupeKey,
        context: sample.context,
        alertId: existing.id,
        outcome: 'deduped',
      };
    }

    const alert = await this.prisma.planningAlert.create({
      data: {
        ruleId: rule.id,
        status: 'OPEN',
        severity: rule.severity,
        metricValue: sample.value,
        thresholdValue: rule.threshold,
        dedupeKey: sample.dedupeKey,
        contextJson: sample.context as Prisma.InputJsonValue,
      },
    });

    // Notifikation. Fehler werden geloggt aber nicht propagiert — der
    // Alert ist persistiert und wird ueber das UI sichtbar.
    await this.dispatchNotifications(rule, alert.id, sample, metric).catch(
      (e: unknown) => {
        this.logger.warn(
          `Notifikation fuer Alert ${alert.id} fehlgeschlagen: ${
            (e as Error).message
          }`,
        );
      },
    );

    return {
      ruleId: rule.id,
      name: rule.name,
      metric,
      triggered: true,
      metricValue: sample.value,
      thresholdValue: rule.threshold,
      dedupeKey: sample.dedupeKey,
      context: sample.context,
      alertId: alert.id,
      outcome: 'created',
    };
  }

  private async computeMetric(
    metric: AlertMetric,
    rule: { scenarioId: string | null; consecutiveMonths: number },
  ): Promise<{
    value: number;
    dedupeKey: string;
    context: Record<string, unknown>;
  } | null> {
    if (metric === 'marginPercent') {
      const m = await this.kpis.latestMarginPercent();
      if (!m) return null;
      return {
        value: m.marginPercent,
        dedupeKey: `marginPercent:${m.year}-${m.month}`,
        context: { year: m.year, month: m.month, marginPercent: m.marginPercent },
      };
    }
    if (metric === 'deltaRevenuePercent') {
      const d = await this.kpis.latestDeltas(rule.scenarioId ?? undefined);
      if (!d || d.deltaRevenuePercent == null) return null;
      return {
        value: d.deltaRevenuePercent,
        dedupeKey: `deltaRevenuePercent:${d.year}-${d.month}`,
        context: {
          year: d.year,
          month: d.month,
          planRevenue: d.planRevenue,
          actualRevenue: d.actualRevenue,
          deltaRevenuePercent: d.deltaRevenuePercent,
        },
      };
    }
    if (metric === 'deltaCostPercent') {
      const d = await this.kpis.latestDeltas(rule.scenarioId ?? undefined);
      if (!d || d.deltaCostPercent == null) return null;
      return {
        value: d.deltaCostPercent,
        dedupeKey: `deltaCostPercent:${d.year}-${d.month}`,
        context: {
          year: d.year,
          month: d.month,
          planCost: d.planCost,
          actualCost: d.actualCost,
          deltaCostPercent: d.deltaCostPercent,
        },
      };
    }
    if (metric === 'negativeMarginStreak') {
      const s = await this.kpis.negativeMarginStreak();
      if (!s) return null;
      // Bei dieser Metrik haengt der Schluessel an der Streak-Laenge —
      // erst wenn die Streak waechst, soll ein neuer Alert kommen.
      return {
        value: s.streak,
        dedupeKey: `negativeMarginStreak:${s.streak}:${s.lastYear}-${s.lastMonth}`,
        context: {
          streak: s.streak,
          lastYear: s.lastYear,
          lastMonth: s.lastMonth,
          required: rule.consecutiveMonths,
        },
      };
    }

    // Phase 10: Pipeline-Metriken brauchen kein Szenario — sie aggregieren
    // global ueber alle Pipeline-Items. Daher VOR dem Szenario-Guard
    // ausgewertet, sonst wuerde fehlendes scenarioId sie blockieren.
    if (metric === 'pipelineWeighted') {
      const forecast = await this.pipeline.getForecast('quarter', 'base');
      const value = forecast.totals.weightedAmount;
      return {
        value,
        dedupeKey: `pipelineWeighted:${value.toFixed(0)}`,
        context: {
          totalAmount: forecast.totals.totalAmount,
          weightedAmount: value,
          earlyStageShare: forecast.totals.earlyStageWeightedShare,
        },
      };
    }
    if (metric === 'pipelineEarlyStageShare') {
      const forecast = await this.pipeline.getForecast('quarter', 'base');
      const value = forecast.totals.earlyStageWeightedShare;
      return {
        value,
        dedupeKey: `pipelineEarlyStageShare:${value.toFixed(0)}`,
        context: {
          earlyStageShare: value,
          weightedAmount: forecast.totals.weightedAmount,
        },
      };
    }

    // Phase 8 Cashflow-/Budget-Metriken brauchen eine konkrete Szenario-Id.
    // Reihenfolge: explizites scenarioId an der Regel > Baseline > juengstes
    // Szenario (Fallback identisch zur KPI-Logik in pickScenario).
    const scenarioId = await this.resolveScenarioForCashflow(rule.scenarioId);
    if (!scenarioId) return null;

    if (metric === 'cashBalance') {
      const proj = await this.cashflow.getCashflow(scenarioId, 6);
      // Ziel-Metrik ist der niedrigste Cash-Bestand im Horizont. Schluessel
      // bindet an den Bestand, damit identische Verletzungen deduplizieren.
      const point =
        proj.minCumulativeCashAtIndex >= 0
          ? proj.months[proj.minCumulativeCashAtIndex]
          : null;
      return {
        value: proj.minCumulativeCash,
        dedupeKey: `cashBalance:${proj.minCumulativeCash.toFixed(0)}`,
        context: {
          scenarioId,
          startingCash: proj.startingCash,
          minCumulativeCash: proj.minCumulativeCash,
          atYear: point?.year ?? null,
          atMonth: point?.month ?? null,
        },
      };
    }
    if (metric === 'negativeCashflowStreak') {
      const proj = await this.cashflow.getCashflow(scenarioId, 12);
      // Laengste zusammenhaengende Strecke negativer Netto-Cashflows.
      let best = 0;
      let current = 0;
      for (const m of proj.months) {
        if (m.netCashflow < 0) {
          current++;
          if (current > best) best = current;
        } else {
          current = 0;
        }
      }
      return {
        value: best,
        dedupeKey: `negativeCashflowStreak:${best}`,
        context: { scenarioId, streak: best, horizonMonths: 12 },
      };
    }
    if (metric === 'capexShare') {
      const kpis = await this.cashflow.getFinancialKpis(scenarioId, 12);
      const share = kpis.budgetTotals.capexShare;
      return {
        value: share,
        dedupeKey: `capexShare:${share.toFixed(0)}`,
        context: {
          scenarioId,
          opex: kpis.budgetTotals.opex,
          capex: kpis.budgetTotals.capex,
          capexShare: share,
        },
      };
    }

    // Phase 9: Kapazitaets-Metriken. Horizont fest auf 12 Wochen, das deckt
    // den UI-Default ab. Engere/weitere Horizonte koennen spaeter pro Regel
    // konfigurierbar gemacht werden.
    if (metric === 'utilizationPercent') {
      const u = await this.capacity.getUtilization(scenarioId, 12);
      // Peak ist die scharfe Groesse — wenn irgendeine Woche ueber dem
      // Schwellwert liegt, soll der Alert feuern.
      return {
        value: u.peakUtilizationPercent,
        dedupeKey: `utilizationPercent:${u.peakUtilizationPercent.toFixed(0)}`,
        context: {
          scenarioId,
          peakUtilizationPercent: u.peakUtilizationPercent,
          averageUtilizationPercent: u.averageUtilizationPercent,
          weeksOverThreshold: u.weeksOverThreshold,
          horizonWeeks: 12,
        },
      };
    }
    if (metric === 'capacityDeltaHours') {
      const u = await this.capacity.getUtilization(scenarioId, 12);
      return {
        value: u.minDeltaHours,
        dedupeKey: `capacityDeltaHours:${u.minDeltaHours.toFixed(0)}`,
        context: {
          scenarioId,
          minDeltaHours: u.minDeltaHours,
          horizonWeeks: 12,
        },
      };
    }
    if (metric === 'overloadWeeksStreak') {
      const u = await this.capacity.getUtilization(scenarioId, 12);
      // Laengste zusammenhaengende Strecke mit utilization > 100%.
      let best = 0;
      let current = 0;
      for (const w of u.weeks) {
        if (w.utilizationPercent > 100) {
          current++;
          if (current > best) best = current;
        } else {
          current = 0;
        }
      }
      return {
        value: best,
        dedupeKey: `overloadWeeksStreak:${best}`,
        context: { scenarioId, streak: best, horizonWeeks: 12 },
      };
    }

    return null;
  }

  /**
   * Findet die scenarioId fuer Cashflow-/Budget-Auswertungen. Fallback-
   * Reihenfolge identisch zur KPI-Service-Logik:
   *   1. explizit an der Regel gesetzte scenarioId
   *   2. Baseline (juengste aktive)
   *   3. zuletzt aktualisiertes Szenario
   */
  private async resolveScenarioForCashflow(
    explicit: string | null,
  ): Promise<string | null> {
    if (explicit) return explicit;
    const baseline = await this.baselines.resolveBaselineScenarioId({});
    if (baseline) return baseline;
    const last = await this.prisma.planningScenario.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return last?.id ?? null;
  }

  // ── Notifikation ──────────────────────────────────────────────

  private async dispatchNotifications(
    rule: {
      id: string;
      name: string;
      severity: string;
      channelInApp: boolean;
      channelEmail: boolean;
    },
    alertId: string,
    sample: {
      value: number;
      context: Record<string, unknown>;
    },
    metric: AlertMetric,
  ) {
    const title = `[Planning] ${rule.name}`;
    const body = formatAlertBody(metric, sample.value, sample.context);
    if (rule.channelInApp) {
      await this.notifications.notifyAdmins(
        'INFO',
        title,
        body,
        'PROJECT',
        alertId,
      );
    }
    if (rule.channelEmail) {
      await this.sendAlertEmails(title, body);
    }
  }

  /**
   * Schickt die Alert-Mail an alle aktiven SUPERADMIN/OFFICE-User mit
   * E-Mail-Adresse. Liest SMTP aus `prisma.smtpConfig` analog zur bestehenden
   * Reminder-Logik. Fail-soft: Wenn keine Konfiguration vorliegt, wird die
   * Methode lautlos zum No-op.
   */
  private async sendAlertEmails(subject: string, body: string) {
    const smtp = await this.prisma.smtpConfig.findFirst();
    if (!smtp?.host) return;
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: { role: { code: { in: ['SUPERADMIN', 'OFFICE'] } } },
        },
        email: { not: '' },
      },
      select: { email: true },
    });
    const addresses = recipients.map((r) => r.email).filter(Boolean);
    if (addresses.length === 0) return;
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
      to: addresses.join(','),
      subject: `[CRM] ${subject}`,
      text: body,
      html: `<div style="font-family:sans-serif;font-size:14px;white-space:pre-line"><h2>${escapeHtml(
        subject,
      )}</h2><p>${escapeHtml(body)}</p></div>`,
    });
  }
}

function compareOperator(
  value: number,
  op: AlertOperator,
  threshold: number,
): boolean {
  if (!Number.isFinite(value)) return false;
  if (op === 'lt') return value < threshold;
  if (op === 'lte') return value <= threshold;
  if (op === 'gt') return value > threshold;
  return value >= threshold; // gte
}

function formatAlertBody(
  metric: AlertMetric,
  value: number,
  ctx: Record<string, unknown>,
) {
  const period =
    ctx.year && ctx.month
      ? `${ctx.year}-${String(ctx.month).padStart(2, '0')}`
      : null;
  const head = period ? `Zeitraum: ${period}\n` : '';
  if (metric === 'marginPercent') {
    return `${head}Ist-Marge: ${value.toFixed(2)} %`;
  }
  if (metric === 'deltaRevenuePercent') {
    return `${head}Delta Umsatz: ${value.toFixed(2)} % (Plan ${ctx.planRevenue}, Ist ${ctx.actualRevenue})`;
  }
  if (metric === 'deltaCostPercent') {
    return `${head}Delta Kosten: ${value.toFixed(2)} % (Plan ${ctx.planCost}, Ist ${ctx.actualCost})`;
  }
  if (metric === 'negativeMarginStreak') {
    return `Negative Marge in ${value} Monaten in Folge (zuletzt ${ctx.lastYear}-${ctx.lastMonth}).`;
  }
  if (metric === 'cashBalance') {
    return `Niedrigster Cash-Bestand im Horizont: ${value.toFixed(2)} EUR (Start ${ctx.startingCash}).`;
  }
  if (metric === 'negativeCashflowStreak') {
    return `Negativer Netto-Cashflow in ${value} Monaten in Folge (Horizont ${ctx.horizonMonths} Monate).`;
  }
  if (metric === 'capexShare') {
    return `Capex-Anteil am Gesamtbudget: ${value.toFixed(2)} % (Opex ${ctx.opex}, Capex ${ctx.capex}).`;
  }
  if (metric === 'utilizationPercent') {
    return `Peak-Auslastung im Horizont (${ctx.horizonWeeks} Wochen): ${value.toFixed(1)} %, ${ctx.weeksOverThreshold} Wochen ueber Schwelle.`;
  }
  if (metric === 'capacityDeltaHours') {
    return `Niedrigste Wochen-Kapazitaetsreserve im Horizont: ${value.toFixed(0)} Stunden.`;
  }
  if (metric === 'overloadWeeksStreak') {
    return `Ueberlastung in ${value} Wochen in Folge (Horizont ${ctx.horizonWeeks} Wochen).`;
  }
  if (metric === 'pipelineWeighted') {
    return `Gewichtete Pipeline (Quartal): ${value.toFixed(2)} EUR (brutto ${ctx.totalAmount}).`;
  }
  if (metric === 'pipelineEarlyStageShare') {
    return `Frueh-Stage-Anteil an gewichteter Pipeline: ${value.toFixed(1)} %.`;
  }
  return `Wert: ${value}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function severityRank(s: AlertSeverity): number {
  if (s === 'CRITICAL') return 3;
  if (s === 'WARN') return 2;
  return 1;
}
