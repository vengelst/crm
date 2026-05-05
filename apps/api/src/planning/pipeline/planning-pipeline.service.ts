import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePipelineItemDto,
  PIPELINE_STAGES,
  PatchPipelineItemDto,
  PipelineRange,
  PipelineScenario,
  PipelineStage,
} from './dto';

const PIPELINE_INCLUDE = {
  owner: { select: { id: true, displayName: true, email: true } },
} as const;

/**
 * Frueh-Stage-Bucket fuer KPI „Anteil fruehe Stages". Spaeter Stages
 * (NEGOTIATION/WON) zaehlen nicht dazu — die haben hohe Hit-Rate und
 * sind keine reine Pipeline-Hoffnung mehr.
 */
const EARLY_STAGES = new Set<PipelineStage>(['LEAD', 'QUALIFIED']);

/**
 * Multiplikatoren fuer Best/Worst-Szenarien.
 *   best   → Wahrscheinlichkeit ×1.2 (max 95%) — Vertrieb erwartet mehr
 *   worst  → Wahrscheinlichkeit ×0.7 — konservative Schaetzung
 *   base   → Eingabe unveraendert
 *
 * WON bleibt 100%, LOST 0% — die Multiplikatoren werden nur auf die
 * offenen Stages angewendet.
 */
function probabilityForScenario(
  stage: PipelineStage,
  raw: number,
  scenario: PipelineScenario,
): number {
  if (stage === 'WON') return 100;
  if (stage === 'LOST') return 0;
  if (scenario === 'best') return Math.min(95, raw * 1.2);
  if (scenario === 'worst') return Math.max(0, raw * 0.7);
  return raw;
}

export type PipelineForecastBucket = {
  /** "YYYY-MM" / "YYYY-Qn" / "YYYY-H1|2" je nach `range`. */
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
    /** Brutto: Summe amountTotal aller offenen Items im Horizont. */
    totalAmount: number;
    /** Gewichtet: Summe amountTotal × winProbability. */
    weightedAmount: number;
    /** Won-Volumen: Summe amountTotal aller Items mit Stage = WON. */
    wonAmount: number;
    /** Frueh-Stage-Anteil in % (LEAD+QUALIFIED weighted / total weighted). */
    earlyStageWeightedShare: number;
    /** Erwartete Wochen-Stunden (offene Items, nach Wahrscheinlichkeit). */
    expectedWeeklyHours: number;
  };
  byStage: Array<{
    stage: PipelineStage;
    itemCount: number;
    totalAmount: number;
    weightedAmount: number;
  }>;
};

@Injectable()
export class PlanningPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ─────────────────────────────────────────────────────

  list(filter?: {
    stage?: PipelineStage;
    ownerUserId?: string | null;
    locationId?: string | null;
    businessUnitId?: string | null;
  }) {
    const where: Record<string, unknown> = {};
    if (filter?.stage) where.stage = filter.stage;
    if (filter?.ownerUserId !== undefined)
      where.ownerUserId = filter.ownerUserId;
    if (filter?.locationId !== undefined) where.locationId = filter.locationId;
    if (filter?.businessUnitId !== undefined)
      where.businessUnitId = filter.businessUnitId;
    return this.prisma.planningPipelineItem.findMany({
      where,
      orderBy: [{ expectedStartDate: 'asc' }, { createdAt: 'desc' }],
      include: PIPELINE_INCLUDE,
      take: 500,
    });
  }

  async create(dto: CreatePipelineItemDto) {
    return this.prisma.planningPipelineItem.create({
      data: this.normalizePayload(
        dto,
        true,
      ) as Prisma.PlanningPipelineItemUncheckedCreateInput,
      include: PIPELINE_INCLUDE,
    });
  }

  async update(id: string, dto: PatchPipelineItemDto) {
    const existing = await this.prisma.planningPipelineItem.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Pipeline-Item nicht gefunden.');
    return this.prisma.planningPipelineItem.update({
      where: { id },
      data: this.normalizePayload(
        dto,
        false,
      ) as Prisma.PlanningPipelineItemUncheckedUpdateInput,
      include: PIPELINE_INCLUDE,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.planningPipelineItem.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Pipeline-Item nicht gefunden.');
    await this.prisma.planningPipelineItem.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Forecast ─────────────────────────────────────────────────

  async getForecast(
    range: PipelineRange,
    scenario: PipelineScenario,
  ): Promise<PipelineForecastResult> {
    const items = await this.prisma.planningPipelineItem.findMany();
    const buckets = new Map<string, PipelineForecastBucket>();
    const byStage = new Map<
      PipelineStage,
      { itemCount: number; totalAmount: number; weightedAmount: number }
    >();
    for (const stage of PIPELINE_STAGES) {
      byStage.set(stage, { itemCount: 0, totalAmount: 0, weightedAmount: 0 });
    }

    let totalAmount = 0;
    let weightedAmount = 0;
    let wonAmount = 0;
    let earlyWeighted = 0;
    let expectedWeeklyHours = 0;

    for (const item of items) {
      const stage = item.stage as PipelineStage;
      const probability = probabilityForScenario(
        stage,
        item.winProbability,
        scenario,
      );
      const weighted = item.amountTotal * (probability / 100);
      const periodRef = bucketRef(item.expectedStartDate, range);

      // Stage-Aggregate. WON/LOST tauchen mit auf, sind aber nicht in
      // earlyStage-Anteil enthalten.
      const sg = byStage.get(stage)!;
      sg.itemCount += 1;
      sg.totalAmount += item.amountTotal;
      sg.weightedAmount += weighted;

      if (stage === 'WON') {
        wonAmount += item.amountTotal;
      }

      // Brutto + gewichtet zaehlen alle Stages, aber LOST nicht (Volumen
      // ist verloren, gewichtet ohnehin 0). WON zaehlt zur Totals — der
      // UI-Block gibt das separat aus.
      if (stage !== 'LOST') {
        totalAmount += item.amountTotal;
        weightedAmount += weighted;
      }
      if (EARLY_STAGES.has(stage)) {
        earlyWeighted += weighted;
      }
      if (
        item.expectedWeeklyHours != null &&
        stage !== 'LOST' &&
        stage !== 'WON'
      ) {
        expectedWeeklyHours += item.expectedWeeklyHours * (probability / 100);
      }

      const bucket = buckets.get(periodRef) ?? {
        periodRef,
        weightedAmount: 0,
        totalAmount: 0,
        itemCount: 0,
      };
      bucket.totalAmount += item.amountTotal;
      bucket.weightedAmount += weighted;
      bucket.itemCount += 1;
      buckets.set(periodRef, bucket);
    }

    const sortedBuckets = [...buckets.values()].sort((a, b) =>
      a.periodRef.localeCompare(b.periodRef),
    );
    const earlyShare =
      weightedAmount > 0 ? (earlyWeighted / weightedAmount) * 100 : 0;

    return {
      scenario,
      range,
      buckets: sortedBuckets,
      totals: {
        totalAmount,
        weightedAmount,
        wonAmount,
        earlyStageWeightedShare: earlyShare,
        expectedWeeklyHours,
      },
      byStage: PIPELINE_STAGES.map((stage) => ({
        stage,
        ...byStage.get(stage)!,
      })),
    };
  }

  // ── Helfer ───────────────────────────────────────────────────

  private normalizePayload<
    T extends CreatePipelineItemDto | PatchPipelineItemDto,
  >(dto: T, isCreate: boolean): Record<string, unknown> {
    const stage = dto.stage as PipelineStage | undefined;
    // WON/LOST zwingen die Wahrscheinlichkeit auf 100/0, damit Reports
    // konsistent bleiben — manuell gesetzte Werte werden ueberschrieben.
    let winProbability = dto.winProbability;
    if (stage === 'WON') winProbability = 100;
    else if (stage === 'LOST') winProbability = 0;

    const payload: Record<string, unknown> = {};
    if (isCreate || dto.title !== undefined) {
      payload.title = (dto.title ?? '').trim();
    }
    if (dto.customerId !== undefined) payload.customerId = dto.customerId ?? null;
    if (dto.projectId !== undefined) payload.projectId = dto.projectId ?? null;
    if (dto.ownerUserId !== undefined) payload.ownerUserId = dto.ownerUserId ?? null;
    if (stage !== undefined) payload.stage = stage;
    if (dto.amountTotal !== undefined) payload.amountTotal = dto.amountTotal;
    if (winProbability !== undefined) payload.winProbability = winProbability;
    if (dto.expectedStartDate !== undefined)
      payload.expectedStartDate = new Date(dto.expectedStartDate);
    if (dto.expectedEndDate !== undefined)
      payload.expectedEndDate = dto.expectedEndDate
        ? new Date(dto.expectedEndDate)
        : null;
    if (dto.expectedWeeklyHours !== undefined)
      payload.expectedWeeklyHours = dto.expectedWeeklyHours ?? null;
    if (dto.locationId !== undefined) payload.locationId = dto.locationId ?? null;
    if (dto.businessUnitId !== undefined)
      payload.businessUnitId = dto.businessUnitId ?? null;
    if (dto.notes !== undefined) payload.notes = dto.notes ? dto.notes.trim() : null;
    return payload;
  }
}

function bucketRef(date: Date, range: PipelineRange): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (range === 'month') {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  if (range === 'quarter') {
    return `${year}-Q${Math.ceil(month / 3)}`;
  }
  return `${year}-H${month <= 6 ? 1 : 2}`;
}
