import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AssignWorkerDto } from './dto/assign-worker.dto';
import { SaveProjectDto } from './dto/save-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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

  listForManager(userId: string) {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        internalProjectManagerUserId: userId,
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

  listForWorker(workerId: string) {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        assignments: {
          some: {
            workerId,
            active: true,
          },
        },
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

  async getByIdForWorker(id: string, workerId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        assignments: {
          some: {
            workerId,
            active: true,
          },
        },
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

  /**
   * Detailansicht fuer Kiosk-User (interne Projektmanager). Liefert nur,
   * wenn der angemeldete User als `internalProjectManagerUserId` am
   * Projekt eingetragen ist — sonst NotFound. Das matched die Logik von
   * `listForManager`, sodass die Liste/Detail-Sicht konsistent ist und
   * verhindert das Leak fremder Projekte ueber Direkt-IDs.
   */
  async getByIdForManager(id: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
        internalProjectManagerUserId: userId,
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

  /**
   * Atomically increment the PROJECT counter and return the next number.
   * Uses UPDATE ... RETURNING inside a transaction to prevent race conditions.
   */
  private async nextProjectNumber(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
  ): Promise<string> {
    const result = await tx.$queryRawUnsafe<
      { prefix: string; current: number }[]
    >(
      `UPDATE "Counter" SET "current" = "current" + 1 WHERE "id" = 'PROJECT' RETURNING "prefix", "current"`,
    );
    if (!result.length) {
      throw new BadRequestException('Counter PROJECT nicht gefunden.');
    }
    return `${result[0].prefix}${result[0].current}`;
  }

  async create(dto: SaveProjectDto) {
    if (!dto.customerId || !dto.title) {
      throw new BadRequestException('customerId und title sind Pflichtfelder.');
    }

    const customerId = dto.customerId;

    // Manual project number: validate uniqueness outside transaction
    if (dto.projectNumber?.trim()) {
      const existing = await this.prisma.project.findFirst({
        where: { projectNumber: dto.projectNumber.trim(), deletedAt: null },
      });
      if (existing) {
        throw new BadRequestException('Projektnummer bereits vergeben.');
      }
    }

    const title = dto.title;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const projectNumber =
            dto.projectNumber?.trim() || (await this.nextProjectNumber(tx));

          return tx.project.create({
            data: {
              projectNumber,
              customerId,
              branchId: dto.branchId,
              title,
              description: dto.description,
              serviceType: dto.serviceType,
              status: dto.status,
              priority: dto.priority ?? 0,
              siteName: dto.siteName,
              siteAddressLine1: dto.siteAddressLine1,
              sitePostalCode: dto.sitePostalCode,
              siteCity: dto.siteCity,
              siteCountry: dto.siteCountry,
              siteLatitude: dto.siteLatitude,
              siteLongitude: dto.siteLongitude,
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
        });
      } catch (e: unknown) {
        const isPrismaUnique =
          e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as { code: string }).code === 'P2002';
        if (
          isPrismaUnique &&
          attempt < MAX_RETRIES - 1 &&
          !dto.projectNumber?.trim()
        ) {
          continue;
        }
        throw e;
      }
    }

    throw new BadRequestException(
      'Projektnummer konnte nicht vergeben werden.',
    );
  }

  async update(id: string, dto: SaveProjectDto) {
    await this.getById(id);

    if (dto.projectNumber) {
      const existing = await this.prisma.project.findFirst({
        where: {
          projectNumber: dto.projectNumber,
          deletedAt: null,
          NOT: { id },
        },
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
        siteLatitude: dto.siteLatitude,
        siteLongitude: dto.siteLongitude,
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

    const assignment = await this.prisma.projectAssignment.create({
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

    void this.notifications.onProjectAssignment(
      dto.workerId,
      assignment.project.projectNumber,
      assignment.project.title,
      projectId,
    );

    return assignment;
  }

  async setAssignments(
    projectId: string,
    data: { workerIds: string[]; startDate: string; endDate?: string },
  ) {
    await this.getById(projectId);

    const newStart = new Date(data.startDate);
    const newEnd = data.endDate ? new Date(data.endDate) : null;

    // Pre-Check: alle workerIds muessen existieren. Sonst wuerde Prisma
    // erst innerhalb der Transaktion mit einem FK-Constraint-Error in
    // ein 500er kippen — unschoen fuer den Aufrufer und schwer zu
    // diagnostizieren. Wir liefern stattdessen eine klare 400 mit der
    // Liste der unbekannten IDs.
    if (data.workerIds.length > 0) {
      const uniqueIds = Array.from(new Set(data.workerIds));
      const existingWorkers = await this.prisma.worker.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      const knownIds = new Set(existingWorkers.map((w) => w.id));
      const unknown = uniqueIds.filter((id) => !knownIds.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Ungueltige workerIds: ${unknown.join(', ')}`,
        );
      }
    }

    // Ueberschneidungspruefung fuer jeden Worker (gleiche Logik wie
    // assignWorker). Bewusst VOR der Transaktion — wir wollen 400er
    // raus haben, ohne erst Schreib-Transaktionen zu oeffnen.
    for (const workerId of data.workerIds) {
      const existing = await this.prisma.projectAssignment.findMany({
        where: {
          workerId,
          active: true,
          NOT: { projectId }, // Eigenes Projekt ausschliessen
        },
        include: { project: true },
      });

      for (const assignment of existing) {
        const exStart = assignment.startDate;
        const exEnd = assignment.endDate;
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
    }

    // Schreibvorgang atomar: Delete/Update/Create in einer einzigen
    // Prisma-Transaktion. Faellt einer der Schritte, wird der Rest
    // zurueckgerollt — kein Teilzustand mit halb angelegten Worker-
    // Zuordnungen mehr. Notifications werden nach erfolgreichem Commit
    // ausserhalb der Transaktion gefeuert (Fire-and-Forget, kein DB-Write).
    const newWorkerIds = new Set(data.workerIds);
    const newlyAssigned = await this.prisma.$transaction(async (tx) => {
      // Bestehende Zuordnungen innerhalb der Transaktion lesen — sonst
      // koennte ein paralleler Schreib-Pfad das Set zwischen Read und
      // Write veraendern.
      const currentAssignments = await tx.projectAssignment.findMany({
        where: { projectId },
      });
      const currentWorkerIds = new Set(
        currentAssignments.map((a) => a.workerId),
      );

      // 1. Entfernte Worker loeschen
      const removedIds = currentAssignments
        .filter((a) => !newWorkerIds.has(a.workerId))
        .map((a) => a.id);
      if (removedIds.length > 0) {
        await tx.projectAssignment.deleteMany({
          where: { id: { in: removedIds } },
        });
      }

      // 2. Bestehende Worker aktualisieren (nur Datum, Metadaten bleiben)
      for (const assignment of currentAssignments) {
        if (newWorkerIds.has(assignment.workerId)) {
          await tx.projectAssignment.update({
            where: { id: assignment.id },
            data: {
              startDate: newStart,
              endDate: newEnd ?? undefined,
            },
          });
        }
      }

      // 3. Neue Worker anlegen
      const newlyCreated: string[] = [];
      for (const workerId of data.workerIds) {
        if (!currentWorkerIds.has(workerId)) {
          await tx.projectAssignment.create({
            data: {
              projectId,
              workerId,
              startDate: newStart,
              endDate: newEnd ?? undefined,
            },
          });
          newlyCreated.push(workerId);
        }
      }
      return newlyCreated;
    });

    // Benachrichtigungen erst nach erfolgreichem Commit. Fehler hier
    // brechen die Zuordnung nicht zurueck — In-App-Notification ist
    // best-effort, der DB-Stand ist konsistent.
    if (newlyAssigned.length > 0) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { projectNumber: true, title: true },
      });
      if (project) {
        for (const workerId of newlyAssigned) {
          void this.notifications.onProjectAssignment(
            workerId,
            project.projectNumber,
            project.title,
            projectId,
          );
        }
      }
    }

    return this.getById(projectId);
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
    // Schluessel: "workerId|YYYY-WW" → Stunden je Monteur je Woche
    const workerWeekHoursMap = new Map<string, number>();

    // Gruppiere nach Worker, paare IN/OUT
    const entriesByWorker = new Map<string, typeof project.timeEntries>();
    for (const entry of project.timeEntries) {
      const list = entriesByWorker.get(entry.workerId) ?? [];
      list.push(entry);
      entriesByWorker.set(entry.workerId, list);
    }

    // TODO Hardening (Phase 11.5): Umstellung auf `occurredAtServer` pruefen.
    // Aktuell rechnen wir mit Client-Zeit, was bei verstellter Geraete-Uhr
    // oder Kiosk-Offline-Mode driften kann. Eine Umstellung wuerde
    // historische Reports verschieben — daher bewusst ungeaendert,
    // bis ein begleitender Migrations-/Validierungslauf vorliegt.
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
            const compositeKey = `${workerId}|${weekKey}`;
            workerWeekHoursMap.set(
              compositeKey,
              (workerWeekHoursMap.get(compositeKey) ?? 0) + hours,
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

    // ── 2. Umsatz berechnen (je Monteur je Woche) ────────────
    let baseRevenue = 0;
    let overtimeRevenue = 0;
    let overtimeHours = 0;

    const weeklyFlatRate = project.weeklyFlatRate ?? null;
    const includedHours = project.includedHoursPerWeek ?? 40;
    const hourlyRate = project.hourlyRateUpTo40h ?? 0;
    const overtimeRate = project.overtimeRate ?? 0;

    // Aggregiere pro Woche fuer die weeklyBreakdown-Response
    const weekAgg = new Map<
      string,
      {
        hours: number;
        overtimeHours: number;
        baseRevenue: number;
        overtimeRevenue: number;
      }
    >();

    for (const [compositeKey, wHours] of workerWeekHoursMap) {
      const week = compositeKey.split('|')[1];
      let wBase = 0;
      let wOvertime = 0;
      let wOvertimeHours = 0;

      if (weeklyFlatRate !== null) {
        // Wochenpauschale je Monteur
        wBase = weeklyFlatRate;
        wOvertimeHours = Math.max(0, wHours - includedHours);
        wOvertime = wOvertimeHours * overtimeRate;
      } else {
        // Stundensatz je Monteur: bis 40h regulaer, darueber Ueberstunden
        const regularHours = Math.min(wHours, 40);
        wOvertimeHours = Math.max(0, wHours - 40);
        wBase = regularHours * hourlyRate;
        wOvertime = wOvertimeHours * overtimeRate;
      }

      baseRevenue += wBase;
      overtimeRevenue += wOvertime;
      overtimeHours += wOvertimeHours;

      const agg = weekAgg.get(week) ?? {
        hours: 0,
        overtimeHours: 0,
        baseRevenue: 0,
        overtimeRevenue: 0,
      };
      agg.hours += wHours;
      agg.overtimeHours += wOvertimeHours;
      agg.baseRevenue += wBase;
      agg.overtimeRevenue += wOvertime;
      weekAgg.set(week, agg);
    }

    const weeklyBreakdown = [...weekAgg.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, agg]) => ({
        week,
        hours: Math.round(agg.hours * 100) / 100,
        overtimeHours: Math.round(agg.overtimeHours * 100) / 100,
        baseRevenue: Math.round(agg.baseRevenue * 100) / 100,
        overtimeRevenue: Math.round(agg.overtimeRevenue * 100) / 100,
      }));

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

  async setBillingReady(
    id: string,
    data: { ready: boolean; comment?: string; userId: string },
  ) {
    const existing = await this.getById(id);
    const result = await this.prisma.project.update({
      where: { id },
      data: {
        billingReady: data.ready,
        billingReadyAt: data.ready ? new Date() : null,
        billingReadyByUserId: data.ready ? data.userId : null,
        billingReadyComment: data.comment ?? null,
      },
      include: {
        customer: true,
        branch: true,
      },
    });

    if (data.ready) {
      void this.notifications.onBillingReady(
        id,
        existing.projectNumber,
        existing.title,
      );
    }

    return result;
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
