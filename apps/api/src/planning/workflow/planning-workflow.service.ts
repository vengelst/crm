import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DecisionAction,
  ScenarioStatus,
  WorkflowCommentDto,
  WorkflowRejectDto,
} from './dto';

/**
 * Erlaubte Statusuebergaenge. Halten wir den State Machine knapp:
 *   DRAFT     -> IN_REVIEW                (submit)
 *   IN_REVIEW -> APPROVED                 (approve)
 *   IN_REVIEW -> REJECTED                 (reject)
 *   REJECTED  -> IN_REVIEW                (re-submit nach Anpassung)
 *   DRAFT     -> ARCHIVED                 (Entwurf verworfen)
 *   APPROVED  -> ARCHIVED                 (Plan ausgelaufen)
 *   REJECTED  -> ARCHIVED                 (Vorgang abgeschlossen)
 *   ARCHIVED  -> DRAFT                    (Re-Aktivierung)
 *
 * Andere Uebergaenge werden mit BadRequest geblockt — verhindert dass
 * z. B. ein APPROVED-Plan ohne ARCHIVED-Schritt versehentlich wieder
 * "in Bearbeitung" geht.
 */
const TRANSITIONS: Record<ScenarioStatus, ScenarioStatus[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['ARCHIVED'],
  REJECTED: ['IN_REVIEW', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

const SCENARIO_INCLUDE = {
  location: { select: { id: true, name: true, code: true } },
  businessUnit: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  decisionLog: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    include: {
      actor: { select: { id: true, displayName: true } },
    },
  },
} as const;

@Injectable()
export class PlanningWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  // ── State Machine Aktionen ────────────────────────────────────

  submit(id: string, dto: WorkflowCommentDto, userId?: string) {
    return this.transition(id, 'IN_REVIEW', 'SUBMIT', dto.comment, userId);
  }

  approve(id: string, dto: WorkflowCommentDto, userId?: string) {
    return this.transition(id, 'APPROVED', 'APPROVE', dto.comment, userId);
  }

  async reject(id: string, dto: WorkflowRejectDto, userId?: string) {
    if (!dto.comment?.trim()) {
      throw new BadRequestException('Pflichtkommentar fuer Ablehnung fehlt.');
    }
    const updated = await this.transition(
      id,
      'REJECTED',
      'REJECT',
      dto.comment,
      userId,
      // Pflichtkommentar zusaetzlich auf dem Szenario fuer schnellen
      // Zugriff aus dem UI (z. B. Badge-Tooltip).
      { rejectionReason: dto.comment.trim() },
    );
    return updated;
  }

  archive(id: string, dto: WorkflowCommentDto, userId?: string) {
    return this.transition(id, 'ARCHIVED', 'ARCHIVE', dto.comment, userId);
  }

  unarchive(id: string, dto: WorkflowCommentDto, userId?: string) {
    return this.transition(id, 'DRAFT', 'UNARCHIVE', dto.comment, userId);
  }

  // ── Decision Log abrufen ──────────────────────────────────────

  async getDecisionLog(scenarioId: string) {
    await this.assertScenario(scenarioId);
    return this.prisma.planningScenarioDecisionLog.findMany({
      where: { scenarioId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  // ── Standort/Einheit Tag-Update (separat von Editor-PATCH) ────

  async setOrgTags(
    id: string,
    dto: { locationId?: string | null; businessUnitId?: string | null },
  ) {
    await this.assertScenario(id);
    return this.prisma.planningScenario.update({
      where: { id },
      data: {
        locationId:
          dto.locationId === undefined ? undefined : (dto.locationId ?? null),
        businessUnitId:
          dto.businessUnitId === undefined
            ? undefined
            : (dto.businessUnitId ?? null),
      },
      include: SCENARIO_INCLUDE,
    });
  }

  // ── interne Helfer ────────────────────────────────────────────

  private async transition(
    id: string,
    target: ScenarioStatus,
    action: DecisionAction,
    comment: string | undefined,
    userId: string | undefined,
    extraData?: Partial<{ rejectionReason: string | null }>,
  ) {
    const scenario = await this.assertScenario(id);
    const current = scenario.status as ScenarioStatus;
    const allowed = TRANSITIONS[current] ?? [];
    if (!allowed.includes(target)) {
      throw new ForbiddenException(
        `Statuswechsel von ${current} nach ${target} ist nicht erlaubt.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // Wenn wir nach DRAFT zurueckkehren (Re-Aktivierung aus ARCHIVED)
      // oder neu einreichen, alte rejectionReason loeschen — sonst
      // blieben veraltete Begruendungen sichtbar.
      const data: Record<string, unknown> = {
        status: target,
        ...(target === 'IN_REVIEW' || target === 'DRAFT'
          ? { rejectionReason: null }
          : {}),
        ...(extraData ?? {}),
      };
      const updated = await tx.planningScenario.update({
        where: { id },
        data,
        include: SCENARIO_INCLUDE,
      });
      await tx.planningScenarioDecisionLog.create({
        data: {
          scenarioId: id,
          action,
          comment: comment?.trim() ? comment.trim() : null,
          actorUserId: userId ?? null,
        },
      });
      return updated;
    });
  }

  private async assertScenario(id: string) {
    const s = await this.prisma.planningScenario.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Szenario nicht gefunden.');
    return s;
  }
}
