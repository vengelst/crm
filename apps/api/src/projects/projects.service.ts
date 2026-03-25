import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignWorkerDto } from './dto/assign-worker.dto';
import { SaveProjectDto } from './dto/save-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        customer: true,
        branch: true,
        assignments: {
          include: {
            worker: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async getById(id: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        customer: true,
        branch: true,
        primaryCustomerContact: true,
        assignments: {
          include: {
            worker: true,
          },
        },
        timeEntries: {
          orderBy: {
            occurredAtServer: 'desc',
          },
          take: 25,
        },
        weeklyTimesheets: {
          orderBy: {
            generatedAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Projekt nicht gefunden.');
    }

    return project;
  }

  async create(dto: SaveProjectDto) {
    if (!dto.projectNumber || !dto.customerId || !dto.title) {
      throw new BadRequestException(
        'projectNumber, customerId und title sind Pflichtfelder.',
      );
    }

    const existing = await this.prisma.project.findFirst({
      where: { projectNumber: dto.projectNumber, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException('Projektnummer bereits vergeben.');
    }

    return this.prisma.project.create({
      data: {
        projectNumber: dto.projectNumber,
        customerId: dto.customerId,
        branchId: dto.branchId,
        title: dto.title,
        description: dto.description,
        serviceType: dto.serviceType,
        status: dto.status,
        priority: dto.priority ?? 0,
        siteName: dto.siteName,
        siteAddressLine1: dto.siteAddressLine1,
        sitePostalCode: dto.sitePostalCode,
        siteCity: dto.siteCity,
        siteCountry: dto.siteCountry,
        accommodationAddress: dto.accommodationAddress,
        weeklyFlatRate: dto.weeklyFlatRate,
        includedHoursPerWeek: dto.includedHoursPerWeek,
        hourlyRateUpTo40h: dto.hourlyRateUpTo40h,
        overtimeRate: dto.overtimeRate,
        plannedStartDate: dto.plannedStartDate
          ? new Date(dto.plannedStartDate)
          : undefined,
        plannedEndDate: dto.plannedEndDate
          ? new Date(dto.plannedEndDate)
          : undefined,
        internalProjectManagerUserId: dto.internalProjectManagerUserId,
        primaryCustomerContactId: dto.primaryCustomerContactId,
        pauseRuleId: dto.pauseRuleId,
        notes: dto.notes,
      },
      include: {
        customer: true,
        branch: true,
      },
    });
  }

  async update(id: string, dto: SaveProjectDto) {
    await this.getById(id);

    if (dto.projectNumber) {
      const existing = await this.prisma.project.findFirst({
        where: { projectNumber: dto.projectNumber, deletedAt: null, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException('Projektnummer bereits vergeben.');
      }
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        projectNumber: dto.projectNumber,
        customerId: dto.customerId,
        branchId: dto.branchId,
        title: dto.title,
        description: dto.description,
        serviceType: dto.serviceType,
        status: dto.status,
        priority: dto.priority,
        siteName: dto.siteName,
        siteAddressLine1: dto.siteAddressLine1,
        sitePostalCode: dto.sitePostalCode,
        siteCity: dto.siteCity,
        siteCountry: dto.siteCountry,
        accommodationAddress: dto.accommodationAddress,
        weeklyFlatRate: dto.weeklyFlatRate,
        includedHoursPerWeek: dto.includedHoursPerWeek,
        hourlyRateUpTo40h: dto.hourlyRateUpTo40h,
        overtimeRate: dto.overtimeRate,
        plannedStartDate: dto.plannedStartDate
          ? new Date(dto.plannedStartDate)
          : undefined,
        plannedEndDate: dto.plannedEndDate
          ? new Date(dto.plannedEndDate)
          : undefined,
        internalProjectManagerUserId: dto.internalProjectManagerUserId,
        primaryCustomerContactId: dto.primaryCustomerContactId,
        pauseRuleId: dto.pauseRuleId,
        notes: dto.notes,
      },
      include: {
        customer: true,
        branch: true,
        assignments: true,
      },
    });
  }

  async assignWorker(projectId: string, dto: AssignWorkerDto) {
    await this.getById(projectId);

    const newStart = new Date(dto.startDate);
    const newEnd = dto.endDate ? new Date(dto.endDate) : null;

    // Pruefen, ob der Monteur bereits eine ueberschneidende Zuordnung hat
    const existing = await this.prisma.projectAssignment.findMany({
      where: {
        workerId: dto.workerId,
        active: true,
      },
      include: { project: true },
    });

    for (const assignment of existing) {
      const exStart = assignment.startDate;
      const exEnd = assignment.endDate;

      // Zwei Zeitraeume ueberschneiden sich, wenn:
      // newStart < exEnd AND newEnd > exStart
      // (offene Enden = unbegrenzt)
      const startBeforeExEnd = !exEnd || newStart < exEnd;
      const endAfterExStart = !newEnd || newEnd > exStart;

      if (startBeforeExEnd && endAfterExStart) {
        const projectLabel = `${assignment.project.projectNumber} – ${assignment.project.title}`;
        throw new BadRequestException(
          `Zeitueberschneidung: Monteur ist bereits dem Projekt "${projectLabel}" zugeordnet ` +
            `(${exStart.toISOString().slice(0, 10)} bis ${exEnd ? exEnd.toISOString().slice(0, 10) : 'offen'}).`,
        );
      }
    }

    return this.prisma.projectAssignment.create({
      data: {
        projectId,
        workerId: dto.workerId,
        roleName: dto.roleName,
        startDate: newStart,
        endDate: newEnd ?? undefined,
        notes: dto.notes,
      },
      include: {
        worker: true,
        project: true,
      },
    });
  }

  async getFinancials(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignments: {
          include: { worker: true },
        },
        timeEntries: {
          orderBy: { occurredAtClient: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Projekt nicht gefunden.');
    }

    // ── 1. Stunden aus CLOCK_IN / CLOCK_OUT-Paaren berechnen ──
    const workerHoursMap = new Map<string, number>();
    const weeklyHoursMap = new Map<string, number>(); // "YYYY-WW" → hours

    // Gruppiere nach Worker, paare IN/OUT
    const entriesByWorker = new Map<
      string,
      typeof project.timeEntries
    >();
    for (const entry of project.timeEntries) {
      const list = entriesByWorker.get(entry.workerId) ?? [];
      list.push(entry);
      entriesByWorker.set(entry.workerId, list);
    }

    for (const [workerId, entries] of entriesByWorker) {
      let pendingClockIn: Date | null = null;

      for (const entry of entries) {
        if (entry.entryType === 'CLOCK_IN') {
          pendingClockIn = entry.occurredAtClient;
        } else if (entry.entryType === 'CLOCK_OUT' && pendingClockIn) {
          const hours =
            (entry.occurredAtClient.getTime() - pendingClockIn.getTime()) /
            3_600_000;
          if (hours > 0 && hours < 24) {
            workerHoursMap.set(
              workerId,
              (workerHoursMap.get(workerId) ?? 0) + hours,
            );
            const weekKey = isoWeekKey(pendingClockIn);
            weeklyHoursMap.set(
              weekKey,
              (weeklyHoursMap.get(weekKey) ?? 0) + hours,
            );
          }
          pendingClockIn = null;
        }
      }
    }

    const totalHours = [...workerHoursMap.values()].reduce(
      (sum, h) => sum + h,
      0,
    );

    // ── 2. Umsatz berechnen (wochenweise) ─────────────────────
    let baseRevenue = 0;
    let overtimeRevenue = 0;
    let overtimeHours = 0;

    const weeklyFlatRate = project.weeklyFlatRate ?? null;
    const includedHours = project.includedHoursPerWeek ?? 40;
    const hourlyRate = project.hourlyRateUpTo40h ?? 0;
    const overtimeRate = project.overtimeRate ?? 0;

    const sortedWeeks = [...weeklyHoursMap.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );

    const weeklyBreakdown: {
      week: string;
      hours: number;
      overtimeHours: number;
      baseRevenue: number;
      overtimeRevenue: number;
    }[] = [];

    for (const [week, weekHours] of sortedWeeks) {
      let wBase = 0;
      let wOvertime = 0;
      let wOvertimeHours = 0;

      if (weeklyFlatRate !== null) {
        // Wochenpauschale: inklusiv bis Grenze, darueber Ueberstundensatz
        wBase = weeklyFlatRate;
        wOvertimeHours = Math.max(0, weekHours - includedHours);
        wOvertime = wOvertimeHours * overtimeRate;
      } else {
        // Kein Pauschale: Stunden bis 40h x Stundensatz, darueber Ueberstundensatz
        const regularHours = Math.min(weekHours, 40);
        wOvertimeHours = Math.max(0, weekHours - 40);
        wBase = regularHours * hourlyRate;
        wOvertime = wOvertimeHours * overtimeRate;
      }

      baseRevenue += wBase;
      overtimeRevenue += wOvertime;
      overtimeHours += wOvertimeHours;

      weeklyBreakdown.push({
        week,
        hours: Math.round(weekHours * 100) / 100,
        overtimeHours: Math.round(wOvertimeHours * 100) / 100,
        baseRevenue: Math.round(wBase * 100) / 100,
        overtimeRevenue: Math.round(wOvertime * 100) / 100,
      });
    }

    const totalRevenue =
      Math.round((baseRevenue + overtimeRevenue) * 100) / 100;

    // ── 3. Monteurkosten ──────────────────────────────────────
    const workerCosts: {
      workerId: string;
      name: string;
      hours: number;
      rate: number | null;
      cost: number;
    }[] = [];

    for (const assignment of project.assignments) {
      const w = assignment.worker;
      const hours = workerHoursMap.get(w.id) ?? 0;
      const rate = w.internalHourlyRate ?? null;
      const cost = rate !== null ? Math.round(hours * rate * 100) / 100 : 0;
      workerCosts.push({
        workerId: w.id,
        name: `${w.firstName} ${w.lastName}`,
        hours: Math.round(hours * 100) / 100,
        rate,
        cost,
      });
    }

    const totalCosts = workerCosts.reduce((sum, w) => sum + w.cost, 0);
    const margin = Math.round((totalRevenue - totalCosts) * 100) / 100;

    return {
      projectId: project.id,
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      baseRevenue: Math.round(baseRevenue * 100) / 100,
      overtimeRevenue: Math.round(overtimeRevenue * 100) / 100,
      totalRevenue,
      workerCosts,
      totalCosts: Math.round(totalCosts * 100) / 100,
      margin,
      weeklyBreakdown,
      pricingModel: weeklyFlatRate !== null ? 'WEEKLY_FLAT_RATE' : 'HOURLY',
    };
  }

  async remove(id: string) {
    await this.getById(id);

    return this.prisma.project.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'CANCELED',
      },
    });
  }
}

function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
