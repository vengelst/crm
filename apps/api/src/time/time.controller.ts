import {
  BadRequestException,
  Body,
  Controller,
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
    workerId?: string;
    type: 'user' | 'worker';
  };
};

@Controller('time')
export class TimeController {
  constructor(private readonly timeService: TimeService) {}

  @Post('clock-in')
  clockIn(@Body() dto: ClockEntryDto) {
    return this.timeService.clockIn(dto);
  }

  @Post('clock-out')
  clockOut(@Body() dto: ClockEntryDto) {
    return this.timeService.clockOut(dto);
  }

  @Get('my-entries')
  listMyEntries(
    @Query('workerId') workerId: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const resolvedWorkerId = request.user?.workerId ?? workerId;
    if (!resolvedWorkerId) {
      throw new BadRequestException('workerId fehlt.');
    }

    return this.timeService.listEntries(resolvedWorkerId);
  }
}
