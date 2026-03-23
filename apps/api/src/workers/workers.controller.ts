import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { SaveWorkerDto } from './dto/save-worker.dto';
import { WorkersService } from './workers.service';

@Controller('workers')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  list() {
    return this.workersService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.workersService.getById(id);
  }

  @Post()
  create(@Body() dto: SaveWorkerDto) {
    return this.workersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveWorkerDto) {
    return this.workersService.update(id, dto);
  }

  @Post(':id/pin/reset')
  resetPin(@Param('id') id: string, @Body('pin') pin: string) {
    return this.workersService.resetPin(id, pin);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workersService.remove(id);
  }
}
