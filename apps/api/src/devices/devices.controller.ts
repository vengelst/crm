import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { DevicesService } from './devices.service';

@Controller('devices')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get('config')
  getConfig() {
    return this.devicesService.getDeviceBindingConfig();
  }

  @Put('config')
  updateConfig(
    @Body() dto: { mode: 'off' | 'warn' | 'enforce'; appliesTo: 'login' | 'time' | 'both' },
  ) {
    return this.devicesService.updateDeviceBindingConfig(dto);
  }

  @Get()
  list() {
    return this.devicesService.list();
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      displayName?: string;
      active?: boolean;
      notes?: string;
      assignedWorkerId?: string | null;
      assignedUserId?: string | null;
    },
  ) {
    return this.devicesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }
}
