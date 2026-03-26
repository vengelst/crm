import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { KioskAllowed } from '../common/decorators/kiosk-allowed.decorator';
import { AssignWorkerDto } from './dto/assign-worker.dto';
import { SaveProjectDto } from './dto/save-project.dto';
import { ProjectsService } from './projects.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker' | 'kiosk-user';
  };
};

@Controller('projects')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @KioskAllowed()
  list(@Req() request: RequestWithUser) {
    if (request.user?.type === 'kiosk-user') {
      return this.projectsService.listForManager(request.user.sub);
    }
    return this.projectsService.list();
  }

  @Get(':id')
  @KioskAllowed()
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

  @Get(':id/financials')
  getFinancials(@Param('id') id: string) {
    return this.projectsService.getFinancials(id);
  }

  @Post(':id/assignments')
  assignWorker(@Param('id') id: string, @Body() dto: AssignWorkerDto) {
    return this.projectsService.assignWorker(id, dto);
  }

  @Put(':id/assignments')
  setAssignments(
    @Param('id') id: string,
    @Body() body: { workerIds: string[]; startDate: string; endDate?: string },
  ) {
    return this.projectsService.setAssignments(id, body);
  }

  @Post(':id/billing-ready')
  setBillingReady(
    @Param('id') id: string,
    @Body() body: { ready: boolean; comment?: string },
    @Req() request: RequestWithUser,
  ) {
    return this.projectsService.setBillingReady(id, {
      ready: body.ready,
      comment: body.comment,
      userId: request.user!.sub,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  @Get('export/ical')
  async exportIcal(@Res() response: Response) {
    const projects = await this.projectsService.list();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CRM Monteur//Projekte//DE',
    ];
    for (const p of projects) {
      if (!p.plannedStartDate) continue;
      const start =
        new Date(p.plannedStartDate)
          .toISOString()
          .replace(/[-:]/g, '')
          .slice(0, 15) + 'Z';
      const end = p.plannedEndDate
        ? new Date(p.plannedEndDate)
            .toISOString()
            .replace(/[-:]/g, '')
            .slice(0, 15) + 'Z'
        : start;
      lines.push(
        'BEGIN:VEVENT',
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${p.projectNumber} - ${p.title}`,
        `DESCRIPTION:Kunde: ${p.customer?.companyName ?? '-'}`,
        `LOCATION:${[p.siteAddressLine1, p.siteCity].filter(Boolean).join(', ')}`,
        `UID:${p.id}@crm-monteur`,
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="projekte.ics"',
    );
    response.send(lines.join('\r\n'));
  }
}
