import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALERT_STATUSES,
  AlertStatus,
  CreatePlanningAlertRuleDto,
  PatchPlanningAlertRuleDto,
} from '../dto/planning-alert.dto';

const RULE_LIST_INCLUDE = {
  scenario: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
} as const;

const ALERT_LIST_INCLUDE = {
  rule: {
    select: {
      id: true,
      name: true,
      metric: true,
      operator: true,
      threshold: true,
      severity: true,
      scenarioId: true,
    },
  },
  acknowledgedBy: { select: { id: true, displayName: true } },
  resolvedBy: { select: { id: true, displayName: true } },
} as const;

/**
 * CRUD fuer Alert-Regeln + Lifecycle (ack/resolve) fuer Alerts.
 *
 * Die eigentliche Auswertung erledigt `PlanningAlertEngineService`. Diese
 * Klasse haelt sich aus der Engine raus, damit der Cron-Code unabhaengig
 * von HTTP-Aufrufen testbar bleibt.
 */
@Injectable()
export class PlanningAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Regeln ────────────────────────────────────────────────────

  listRules() {
    return this.prisma.planningAlertRule.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: RULE_LIST_INCLUDE,
    });
  }

  async getRule(id: string) {
    const rule = await this.prisma.planningAlertRule.findUnique({
      where: { id },
      include: RULE_LIST_INCLUDE,
    });
    if (!rule) throw new NotFoundException('Regel nicht gefunden.');
    return rule;
  }

  async createRule(dto: CreatePlanningAlertRuleDto, userId?: string) {
    return this.prisma.planningAlertRule.create({
      data: {
        name: dto.name.trim(),
        scenarioId: dto.scenarioId ?? null,
        metric: dto.metric,
        operator: dto.operator,
        threshold: dto.threshold,
        consecutiveMonths: dto.consecutiveMonths ?? 1,
        severity: dto.severity ?? 'WARN',
        channelInApp: dto.channelInApp ?? true,
        channelEmail: dto.channelEmail ?? false,
        active: dto.active ?? true,
        createdByUserId: userId ?? null,
      },
      include: RULE_LIST_INCLUDE,
    });
  }

  async updateRule(id: string, dto: PatchPlanningAlertRuleDto) {
    await this.getRule(id);
    return this.prisma.planningAlertRule.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        // null erlaubt — Szenario explizit loesen.
        scenarioId:
          dto.scenarioId === undefined ? undefined : (dto.scenarioId ?? null),
        metric: dto.metric ?? undefined,
        operator: dto.operator ?? undefined,
        threshold: dto.threshold ?? undefined,
        consecutiveMonths: dto.consecutiveMonths ?? undefined,
        severity: dto.severity ?? undefined,
        channelInApp:
          dto.channelInApp === undefined ? undefined : dto.channelInApp,
        channelEmail:
          dto.channelEmail === undefined ? undefined : dto.channelEmail,
        active: dto.active === undefined ? undefined : dto.active,
      },
      include: RULE_LIST_INCLUDE,
    });
  }

  async removeRule(id: string) {
    await this.getRule(id);
    await this.prisma.planningAlertRule.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Alerts (Lifecycle) ────────────────────────────────────────

  listAlerts(filter?: {
    status?: AlertStatus;
    severity?: string;
    from?: string;
    to?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filter?.status) {
      if (!ALERT_STATUSES.includes(filter.status)) {
        throw new BadRequestException('Unbekannter Status.');
      }
      where.status = filter.status;
    }
    if (filter?.severity) {
      where.severity = filter.severity;
    }
    const fromDate = filter?.from ? parseDate(filter.from) : null;
    const toDate = filter?.to ? parseDate(filter.to) : null;
    if (fromDate || toDate) {
      where.triggeredAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }
    return this.prisma.planningAlert.findMany({
      where,
      orderBy: [{ triggeredAt: 'desc' }],
      take: 200,
      include: ALERT_LIST_INCLUDE,
    });
  }

  async getAlert(id: string) {
    const alert = await this.prisma.planningAlert.findUnique({
      where: { id },
      include: ALERT_LIST_INCLUDE,
    });
    if (!alert) throw new NotFoundException('Alert nicht gefunden.');
    return alert;
  }

  async acknowledge(id: string, userId?: string) {
    const alert = await this.getAlert(id);
    if (alert.status !== 'OPEN') {
      throw new BadRequestException(
        `Alert ist nicht mehr offen (Status: ${alert.status}).`,
      );
    }
    return this.prisma.planningAlert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: userId ?? null,
      },
      include: ALERT_LIST_INCLUDE,
    });
  }

  async resolve(id: string, userId?: string) {
    const alert = await this.getAlert(id);
    if (alert.status === 'RESOLVED') {
      throw new BadRequestException('Alert ist bereits geloest.');
    }
    return this.prisma.planningAlert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: userId ?? null,
      },
      include: ALERT_LIST_INCLUDE,
    });
  }
}

function parseDate(value: string): Date | null {
  const t = value.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
