import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RemindersService } from './reminders.service';

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
}
