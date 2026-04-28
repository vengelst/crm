import { BadRequestException, Injectable } from '@nestjs/common';
import { GpsEventType, TimeEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { ClockEntryDto } from './dto/clock-entry.dto';

@Injectable()
export class TimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
  ) {}

  async clockIn(dto: ClockEntryDto) {
    // 1. Pruefen: kein offener CLOCK_IN vorhanden
    const openEntry = await this.findOpenClockIn(dto.workerId);
    if (openEntry) {
      throw new BadRequestException(
        'Es existiert bereits eine laufende Arbeit. Bitte zuerst beenden.',
      );
    }

    // 2. Pruefen: aktuelle Projektzuordnung gueltig
    await this.ensureCurrentAssignment(dto.workerId, dto.projectId);

    // 3. Geraetepruefung
    const deviceCheck = await this.devicesService.checkDevice(
      'time',
      dto.deviceUuid,
      { workerId: dto.workerId },
    );

    const entry = await this.createEntry(
      TimeEntryType.CLOCK_IN,
      GpsEventType.CLOCK_IN,
      dto,
    );
    return { ...entry, deviceWarning: deviceCheck.warning ?? null };
  }

  async clockOut(dto: ClockEntryDto) {
    // 1. Pruefen: offener CLOCK_IN existiert
    const openEntry = await this.findOpenClockIn(dto.workerId);
    if (!openEntry) {
      throw new BadRequestException(
        'Arbeit kann nicht beendet werden, da kein offener Arbeitsbeginn vorhanden ist.',
      );
    }

    // 2. Pruefen: CLOCK_OUT muss auf dasselbe Projekt wie der offene CLOCK_IN
    if (openEntry.projectId !== dto.projectId) {
      throw new BadRequestException(
        'Projektwechsel waehrend einer laufenden Arbeit ist nicht erlaubt. ' +
          'Bitte die laufende Arbeit zuerst beenden.',
      );
    }

    // 3. Geraetepruefung
    const deviceCheck = await this.devicesService.checkDevice(
      'time',
      dto.deviceUuid,
      { workerId: dto.workerId },
    );

    const entry = await this.createEntry(
      TimeEntryType.CLOCK_OUT,
      GpsEventType.CLOCK_OUT,
      dto,
    );
    return { ...entry, deviceWarning: deviceCheck.warning ?? null };
  }

  /**
   * Gibt den aktuell offenen Arbeitsvorgang zurueck (letzter CLOCK_IN ohne
   * nachfolgendes CLOCK_OUT), oder null wenn keiner offen ist.
   *
   * Strategie: Hole den letzten CLOCK_IN. Pruefe dann, ob danach ein
   * CLOCK_OUT existiert. Wenn nein → offen.
   */
  async findOpenClockIn(workerId: string) {
    const lastClockIn = await this.prisma.timeEntry.findFirst({
      where: { workerId, entryType: 'CLOCK_IN' },
      orderBy: { occurredAtServer: 'desc' },
      include: { project: true },
    });

    if (!lastClockIn) return null;

    // Gibt es einen CLOCK_OUT der NACH diesem CLOCK_IN liegt?
    const laterClockOut = await this.prisma.timeEntry.findFirst({
      where: {
        workerId,
        entryType: 'CLOCK_OUT',
        occurredAtServer: { gt: lastClockIn.occurredAtServer },
      },
    });

    if (laterClockOut) return null; // Arbeit wurde beendet

    return lastClockIn;
  }

  listEntries(workerId: string) {
    return this.prisma.timeEntry.findMany({
      where: { workerId },
      include: { project: true },
      orderBy: { occurredAtServer: 'desc' },
      take: 100,
    });
  }

  /**
   * Bueromodus: je zugeordnetem Monteur Status/Zeit **auf diesem Projekt** (heute, Server-Lokalzeit).
   * Gebündelte Queries statt N+1 pro Monteur.
   */
  async getProjectAssignmentTimeSummary(projectId: string) {
    const assignments = await this.prisma.projectAssignment.findMany({
      where: { projectId, active: true },
      select: { workerId: true },
    });
    const workerIds = [...new Set(assignments.map((a) => a.workerId))];
    if (workerIds.length === 0) {
      return [];
    }

    const now = new Date();
    const todayStartMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const nowMs = now.getTime();
    const yesterday = new Date(todayStartMs - 24 * 3600_000);
    const inOutLookback = new Date(nowMs - 366 * 24 * 3600 * 1000);

    const [allProjectEntries, allInOut] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          projectId,
          workerId: { in: workerIds },
          occurredAtClient: { gte: yesterday },
        },
        orderBy: [{ workerId: 'asc' }, { occurredAtClient: 'asc' }],
      }),
      this.prisma.timeEntry.findMany({
        where: {
          workerId: { in: workerIds },
          entryType: { in: ['CLOCK_IN', 'CLOCK_OUT'] },
          occurredAtServer: { gte: inOutLookback },
        },
        orderBy: [{ workerId: 'asc' }, { occurredAtServer: 'asc' }],
      }),
    ]);

    const projectByWorker = new Map<string, typeof allProjectEntries>();
    for (const e of allProjectEntries) {
      const list = projectByWorker.get(e.workerId) ?? [];
      list.push(e);
      projectByWorker.set(e.workerId, list);
    }

    const inOutByWorker = new Map<string, typeof allInOut>();
    for (const e of allInOut) {
      const list = inOutByWorker.get(e.workerId) ?? [];
      list.push(e);
      inOutByWorker.set(e.workerId, list);
    }

    const rows: Array<{
      workerId: string;
      workingOnProjectNow: boolean;
      openClockInStartedAt: string | null;
      todayFirstClockInOnProjectAt: string | null;
      todayMinutesOnProject: number;
    }> = [];

    for (const workerId of workerIds) {
      const entries = projectByWorker.get(workerId) ?? [];
      const openEntry = this.findOpenClockInFromInOutSequence(
        inOutByWorker.get(workerId) ?? [],
      );
      const workingOnProjectNow =
        !!openEntry && openEntry.projectId === projectId;

      let todayFirstClockInOnProjectAt: string | null = null;
      for (const e of entries) {
        if (
          e.entryType === 'CLOCK_IN' &&
          e.occurredAtClient.getTime() >= todayStartMs
        ) {
          todayFirstClockInOnProjectAt = e.occurredAtClient.toISOString();
          break;
        }
      }

      let completedMinutes = 0;
      let pendingClockIn: Date | null = null;
      for (const entry of entries) {
        if (entry.entryType === 'CLOCK_IN') {
          pendingClockIn = entry.occurredAtClient;
        } else if (entry.entryType === 'CLOCK_OUT' && pendingClockIn) {
          const blockStart = Math.max(pendingClockIn.getTime(), todayStartMs);
          const blockEnd = entry.occurredAtClient.getTime();
          if (blockEnd > todayStartMs) {
            const ms = blockEnd - blockStart;
            if (ms > 0) {
              completedMinutes += ms / 60_000;
            }
          }
          pendingClockIn = null;
        }
      }

      let openSinceMinutes = 0;
      if (pendingClockIn) {
        const blockStart = Math.max(pendingClockIn.getTime(), todayStartMs);
        openSinceMinutes = (nowMs - blockStart) / 60_000;
      }

      rows.push({
        workerId,
        workingOnProjectNow,
        openClockInStartedAt:
          workingOnProjectNow && openEntry
            ? openEntry.occurredAtClient.toISOString()
            : null,
        todayFirstClockInOnProjectAt,
        todayMinutesOnProject: Math.round(
          completedMinutes + openSinceMinutes,
        ),
      });
    }

    return rows;
  }

  /**
   * Letzter offener CLOCK_IN aus chronologischer IN/OUT-Folge (gleiche Logik wie findOpenClockIn, ohne DB).
   */
  private findOpenClockInFromInOutSequence(
    entries: Array<{
      entryType: string;
      occurredAtServer: Date;
      occurredAtClient: Date;
      projectId: string;
    }>,
  ): (typeof entries)[0] | null {
    let open: (typeof entries)[0] | null = null;
    for (const e of entries) {
      if (e.entryType === 'CLOCK_IN') {
        open = e;
      } else if (e.entryType === 'CLOCK_OUT') {
        if (open && e.occurredAtServer > open.occurredAtServer) {
          open = null;
        }
      }
    }
    return open;
  }

  async getTodayStats(workerId: string) {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayStartMs = todayStart.getTime();
    const nowMs = now.getTime();

    // Lade Eintraege ab gestern, um Mitternachts-Ueberlappungen zu erfassen
    const yesterday = new Date(todayStartMs - 24 * 3600_000);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        workerId,
        occurredAtClient: { gte: yesterday },
      },
      orderBy: { occurredAtClient: 'asc' },
    });

    let completedMinutes = 0;
    let pendingClockIn: Date | null = null;

    for (const entry of entries) {
      if (entry.entryType === 'CLOCK_IN') {
        pendingClockIn = entry.occurredAtClient;
      } else if (entry.entryType === 'CLOCK_OUT' && pendingClockIn) {
        // Nur den heutigen Anteil des Blocks zaehlen
        const blockStart = Math.max(pendingClockIn.getTime(), todayStartMs);
        const blockEnd = entry.occurredAtClient.getTime();
        if (blockEnd > todayStartMs) {
          const ms = blockEnd - blockStart;
          if (ms > 0) {
            completedMinutes += ms / 60_000;
          }
        }
        pendingClockIn = null;
      }
    }

    // Offener Block: heutiger Anteil bis jetzt
    let openSinceMinutes = 0;
    if (pendingClockIn) {
      const blockStart = Math.max(pendingClockIn.getTime(), todayStartMs);
      openSinceMinutes = (nowMs - blockStart) / 60_000;
    }

    return {
      completedMinutes: Math.round(completedMinutes),
      openSinceMinutes: Math.round(openSinceMinutes),
      totalMinutes: Math.round(completedMinutes + openSinceMinutes),
    };
  }

  private async ensureCurrentAssignment(workerId: string, projectId: string) {
    const now = new Date();
    const assignment = await this.prisma.projectAssignment.findFirst({
      where: {
        workerId,
        projectId,
        active: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
    });

    if (!assignment) {
      throw new BadRequestException(
        'Fuer dieses Projekt besteht aktuell keine gueltige Zuordnung.',
      );
    }
  }

  private async createEntry(
    entryType: TimeEntryType,
    eventType: GpsEventType,
    dto: ClockEntryDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Resolve device display name if deviceUuid provided
      let deviceDisplayName: string | undefined;
      if (dto.deviceUuid) {
        const dev = await tx.kioskDevice.findUnique({
          where: { deviceUuid: dto.deviceUuid },
          select: { displayName: true },
        });
        deviceDisplayName = dev?.displayName ?? undefined;
      }

      const entry = await tx.timeEntry.create({
        data: {
          workerId: dto.workerId,
          projectId: dto.projectId,
          entryType,
          occurredAtClient: dto.occurredAtClient
            ? new Date(dto.occurredAtClient)
            : new Date(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          locationSource: dto.locationSource,
          comment: dto.comment,
          sourceDevice: dto.sourceDevice,
          deviceUuid: dto.deviceUuid,
          deviceDisplayName,
        },
        include: { project: true },
      });

      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        await tx.gpsEvent.create({
          data: {
            workerId: dto.workerId,
            projectId: dto.projectId,
            relatedTimeEntryId: entry.id,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy,
            eventType,
          },
        });
      }

      return entry;
    });
  }
}
