import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ClockEntryDto } from './dto/clock-entry.dto';
import { TimeService } from './time.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    workerId?: string;
    type: 'user' | 'worker';
  };
};

@Controller('time')
export class TimeController {
  constructor(private readonly timeService: TimeService) {}

  @Post('clock-in')
  clockIn(@Body() dto: ClockEntryDto, @Req() request: RequestWithUser) {
    this.enforceWorkerIdentity(request, dto);
    return this.timeService.clockIn(dto);
  }

  @Post('clock-out')
  clockOut(@Body() dto: ClockEntryDto, @Req() request: RequestWithUser) {
    this.enforceWorkerIdentity(request, dto);
    return this.timeService.clockOut(dto);
  }

  @Get('status')
  async getStatus(
    @Query('workerId') workerId: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const resolvedWorkerId = this.resolveWorkerId(request, workerId);

    const openEntry =
      await this.timeService.findOpenClockIn(resolvedWorkerId);
    return {
      hasOpenWork: !!openEntry,
      openEntry: openEntry
        ? {
            id: openEntry.id,
            projectId: openEntry.projectId,
            projectTitle: openEntry.project.title,
            projectNumber: openEntry.project.projectNumber,
            startedAt: openEntry.occurredAtClient.toISOString(),
            latitude: openEntry.latitude,
            longitude: openEntry.longitude,
            locationSource: openEntry.locationSource,
          }
        : null,
    };
  }

  @Get('my-entries')
  listMyEntries(
    @Query('workerId') workerId: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const resolvedWorkerId = this.resolveWorkerId(request, workerId);
    return this.timeService.listEntries(resolvedWorkerId);
  }

  /**
   * Wenn der eingeloggte User ein Worker ist, darf er nur
   * fuer sich selbst buchen. Der Body-workerId wird gegen
   * den JWT-workerId validiert.
   */
  private enforceWorkerIdentity(
    request: RequestWithUser,
    dto: ClockEntryDto,
  ) {
    if (request.user?.type === 'worker') {
      const jwtWorkerId = request.user.workerId ?? request.user.sub;
      if (dto.workerId !== jwtWorkerId) {
        throw new ForbiddenException(
          'Zeitbuchung ist nur fuer den angemeldeten Monteur erlaubt.',
        );
      }
    }
  }

  private resolveWorkerId(
    request: RequestWithUser,
    queryWorkerId?: string,
  ): string {
    if (request.user?.type === 'worker') {
      return request.user.workerId ?? request.user.sub;
    }
    if (queryWorkerId) {
      return queryWorkerId;
    }
    throw new BadRequestException('workerId fehlt.');
  }
}
