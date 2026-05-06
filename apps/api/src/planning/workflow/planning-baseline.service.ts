import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PERIOD_TYPES, PeriodType, SetBaselineDto } from './dto';

const PERIOD_PATTERNS: Record<PeriodType, RegExp> = {
  MONTH: /^[0-9]{4}-(0[1-9]|1[0-2])$/,
  QUARTER: /^[0-9]{4}-Q[1-4]$/,
  YEAR: /^[0-9]{4}$/,
};

/**
 * Baseline-Verwaltung. Eine Baseline bindet ein freigegebenes Szenario an
 * eine konkrete Periode (Monat/Quartal/Jahr) und optional an einen
 * Standort/Einheit. Pro (Standort, Einheit, Periode-Typ, Periode) gibt es
 * exakt eine aktive Baseline; vorhandene werden auf `active=false` gesetzt
 * statt geloescht (Audit-Spur).
 *
 * Plan-vs-Ist und Forecast koennen `resolveBaselineScenarioId` nutzen, um
 * das passende Szenario zu finden, wenn der Aufrufer keinen
 * `scenarioId`-Parameter mitschickt.
 */
@Injectable()
export class PlanningBaselineService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: {
    locationId?: string | null;
    businessUnitId?: string | null;
    activeOnly?: boolean;
  }) {
    return this.prisma.planningBaseline.findMany({
      where: {
        ...(filter.activeOnly ? { active: true } : {}),
        ...(filter.locationId !== undefined
          ? { locationId: filter.locationId }
          : {}),
        ...(filter.businessUnitId !== undefined
          ? { businessUnitId: filter.businessUnitId }
          : {}),
      },
      orderBy: [{ active: 'desc' }, { setAt: 'desc' }],
      include: {
        scenario: {
          select: { id: true, name: true, status: true },
        },
        location: { select: { id: true, name: true, code: true } },
        businessUnit: { select: { id: true, name: true, code: true } },
        setBy: { select: { id: true, displayName: true } },
      },
      take: 200,
    });
  }

  async setBaseline(scenarioId: string, dto: SetBaselineDto, userId?: string) {
    const scenario = await this.prisma.planningScenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new NotFoundException('Szenario nicht gefunden.');
    if (scenario.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Nur freigegebene Szenarien koennen als Baseline gesetzt werden.',
      );
    }
    if (!PERIOD_TYPES.includes(dto.periodType)) {
      throw new BadRequestException('Ungueltiger periodType.');
    }
    const ref = dto.periodRef.trim();
    if (!PERIOD_PATTERNS[dto.periodType].test(ref)) {
      throw new BadRequestException(
        `periodRef "${ref}" passt nicht zum Format ${dto.periodType}.`,
      );
    }

    const locationId = dto.locationId ?? null;
    const businessUnitId = dto.businessUnitId ?? null;

    return this.prisma.$transaction(async (tx) => {
      // Vorhandene aktive Baselines fuer dieselbe Periode/Standort/Einheit
      // deaktivieren, statt loeschen — wir wollen die Historie behalten.
      await tx.planningBaseline.updateMany({
        where: {
          active: true,
          locationId,
          businessUnitId,
          periodType: dto.periodType,
          periodRef: ref,
        },
        data: { active: false },
      });
      const baseline = await tx.planningBaseline.create({
        data: {
          scenarioId,
          locationId,
          businessUnitId,
          periodType: dto.periodType,
          periodRef: ref,
          active: true,
          setByUserId: userId ?? null,
        },
        include: {
          scenario: {
            select: { id: true, name: true, status: true },
          },
          location: { select: { id: true, name: true, code: true } },
          businessUnit: { select: { id: true, name: true, code: true } },
          setBy: { select: { id: true, displayName: true } },
        },
      });
      await tx.planningScenarioDecisionLog.create({
        data: {
          scenarioId,
          action: 'SET_BASELINE',
          comment: `Baseline ${dto.periodType} ${ref}${
            locationId ? ` · loc=${locationId}` : ''
          }${businessUnitId ? ` · unit=${businessUnitId}` : ''}`,
          actorUserId: userId ?? null,
        },
      });
      return baseline;
    });
  }

  async unsetBaseline(baselineId: string, userId?: string) {
    const existing = await this.prisma.planningBaseline.findUnique({
      where: { id: baselineId },
    });
    if (!existing) throw new NotFoundException('Baseline nicht gefunden.');
    if (!existing.active) {
      return existing;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.planningBaseline.update({
        where: { id: baselineId },
        data: { active: false },
      });
      await tx.planningScenarioDecisionLog.create({
        data: {
          scenarioId: existing.scenarioId,
          action: 'UNSET_BASELINE',
          comment: `Baseline ${existing.periodType} ${existing.periodRef} deaktiviert.`,
          actorUserId: userId ?? null,
        },
      });
      return updated;
    });
  }

  /**
   * Liefert die scenarioId der besten passenden aktiven Baseline.
   * Suchreihenfolge:
   *   1. exakte Uebereinstimmung von locationId + businessUnitId + period
   *   2. globale Baseline (locationId/businessUnitId beide null) + period
   *   3. juengste Baseline ueberhaupt (period ignoriert)
   * Wird von KPI/Forecast als Fallback fuer "keine scenarioId angegeben"
   * verwendet.
   */
  async resolveBaselineScenarioId(opts: {
    locationId?: string | null;
    businessUnitId?: string | null;
    periodType?: PeriodType;
    periodRef?: string;
  }): Promise<string | null> {
    const { locationId = null, businessUnitId = null } = opts;
    const baseWhere = { active: true } as const;
    if (opts.periodType && opts.periodRef) {
      const exact = await this.prisma.planningBaseline.findFirst({
        where: {
          ...baseWhere,
          locationId,
          businessUnitId,
          periodType: opts.periodType,
          periodRef: opts.periodRef,
        },
        orderBy: { setAt: 'desc' },
      });
      if (exact) return exact.scenarioId;
      const global = await this.prisma.planningBaseline.findFirst({
        where: {
          ...baseWhere,
          locationId: null,
          businessUnitId: null,
          periodType: opts.periodType,
          periodRef: opts.periodRef,
        },
        orderBy: { setAt: 'desc' },
      });
      if (global) return global.scenarioId;
    }
    const fallback = await this.prisma.planningBaseline.findFirst({
      where: baseWhere,
      orderBy: { setAt: 'desc' },
    });
    return fallback?.scenarioId ?? null;
  }
}
