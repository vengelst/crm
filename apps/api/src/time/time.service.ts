import { Injectable } from '@nestjs/common';
import { GpsEventType, TimeEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClockEntryDto } from './dto/clock-entry.dto';

@Injectable()
export class TimeService {
  constructor(private readonly prisma: PrismaService) {}

  async clockIn(dto: ClockEntryDto) {
    return this.createEntry(TimeEntryType.CLOCK_IN, GpsEventType.CLOCK_IN, dto);
  }

  async clockOut(dto: ClockEntryDto) {
    return this.createEntry(
      TimeEntryType.CLOCK_OUT,
      GpsEventType.CLOCK_OUT,
      dto,
    );
  }

  listEntries(workerId: string) {
    return this.prisma.timeEntry.findMany({
      where: {
        workerId,
      },
      include: {
        project: true,
      },
      orderBy: {
        occurredAtServer: 'desc',
      },
      take: 100,
    });
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
          comment: dto.comment,
          sourceDevice: dto.sourceDevice,
        },
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
