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
import { AssignWorkerDto } from './dto/assign-worker.dto';
import { SaveProjectDto } from './dto/save-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.projectsService.getById(id);
  }

  @Post()
  create(@Body() dto: SaveProjectDto) {
    return this.projectsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Post(':id/assignments')
  assignWorker(@Param('id') id: string, @Body() dto: AssignWorkerDto) {
    return this.projectsService.assignWorker(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
