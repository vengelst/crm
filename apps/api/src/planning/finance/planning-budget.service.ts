import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateBudgetItemDto,
  PatchBudgetItemDto,
} from './dto';

/**
 * Budgetposten-CRUD je Szenario.
 *
 * Validierungslogik bleibt absichtlich knapp — die Cashflow-Projektion
 * (siehe planning-cashflow.service.ts) interpretiert Frequency/Date
 * konsistent. Hier passieren nur Persistenz und Look-up.
 *
 * Hinweis: `locationId` / `businessUnitId` sind freie Strings (keine FK
 * relations), damit Frontend-seitig die Lookup-Listen aus Phase 7 wieder-
 * verwendet werden koennen ohne weitere Joins. Aufloesung passiert dort.
 */
@Injectable()
export class PlanningBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  list(scenarioId: string) {
    return this.prisma.planningBudgetItem.findMany({
      where: { scenarioId },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(
    scenarioId: string,
    dto: CreateBudgetItemDto,
    userId?: string,
  ) {
    await this.assertScenario(scenarioId);
    return this.prisma.planningBudgetItem.create({
      data: {
        scenarioId,
        category: dto.category.trim(),
        name: dto.name.trim(),
        costType: dto.costType,
        amount: dto.amount,
        frequency: dto.frequency,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        locationId: dto.locationId ?? null,
        businessUnitId: dto.businessUnitId ?? null,
        createdByUserId: userId ?? null,
      },
    });
  }

  async update(id: string, dto: PatchBudgetItemDto) {
    const existing = await this.prisma.planningBudgetItem.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Budgetposten nicht gefunden.');
    }
    return this.prisma.planningBudgetItem.update({
      where: { id },
      data: {
        category: dto.category !== undefined ? dto.category.trim() : undefined,
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        costType: dto.costType ?? undefined,
        amount: dto.amount ?? undefined,
        frequency: dto.frequency ?? undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate:
          dto.endDate === undefined
            ? undefined
            : dto.endDate
              ? new Date(dto.endDate)
              : null,
        locationId:
          dto.locationId === undefined ? undefined : (dto.locationId ?? null),
        businessUnitId:
          dto.businessUnitId === undefined
            ? undefined
            : (dto.businessUnitId ?? null),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.planningBudgetItem.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Budgetposten nicht gefunden.');
    }
    await this.prisma.planningBudgetItem.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertScenario(id: string) {
    const s = await this.prisma.planningScenario.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Szenario nicht gefunden.');
    return s;
  }
}
