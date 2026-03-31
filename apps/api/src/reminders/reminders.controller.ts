import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RemindersService } from './reminders.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker' | 'kiosk-user';
  };
};

@Controller('reminders')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('config')
  getConfig() {
    return this.remindersService.getConfig();
  }

  @Put('config')
  updateConfig(
    @Body()
    dto: {
      enabled?: boolean;
      missingTime?: boolean;
      openSignatures?: boolean;
      openApprovals?: boolean;
      projectStart?: boolean;
      emailEnabled?: boolean;
      intervalHours?: number;
    },
  ) {
    return this.remindersService.updateConfig(dto);
  }

  @Post('run')
  runNow() {
    return this.remindersService.runReminders();
  }

  @Get('reference-data')
  getReferenceData() {
    return this.remindersService.getOfficeReminderReferenceData();
  }

  @Get('items')
  listItems(@Query('status') status?: string) {
    return this.remindersService.listOfficeReminders(status);
  }

  @Post('items')
  createItem(
    @Body() dto: Record<string, unknown>,
    @Req() request: RequestWithUser,
  ) {
    return this.remindersService.createOfficeReminder(dto, request.user!.sub);
  }

  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.remindersService.updateOfficeReminder(id, dto);
  }

  @Post('items/:id/complete')
  completeItem(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.remindersService.completeOfficeReminder(id, request.user!.sub);
  }

  @Post('items/:id/reopen')
  reopenItem(@Param('id') id: string) {
    return this.remindersService.reopenOfficeReminder(id);
  }

  @Delete('items/:id')
  deleteItem(@Param('id') id: string) {
    return this.remindersService.deleteOfficeReminder(id);
  }

  @Get('items/:id/calendar.ics')
  async downloadCalendar(@Param('id') id: string, @Res() response: Response) {
    const file = await this.remindersService.getOfficeReminderCalendarFile(id);
    response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.content);
  }
}
