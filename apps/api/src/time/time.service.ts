import { BadRequestException, Injectable } from '@nestjs/common';
import { GpsEventType, TimeEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClockEntryDto } from './dto/clock-entry.dto';

@Injectable()
export class TimeService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.createEntry(TimeEntryType.CLOCK_IN, GpsEventType.CLOCK_IN, dto);
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

    return this.createEntry(
      TimeEntryType.CLOCK_OUT,
      GpsEventType.CLOCK_OUT,
      dto,
    );
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
