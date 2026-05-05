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
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsBypassForTokenTypes } from '../common/decorators/permissions-bypass.decorator';
import { AssignWorkerDto } from './dto/assign-worker.dto';
import { SaveProjectDto } from './dto/save-project.dto';
import { ProjectsService } from './projects.service';
import { TimeService } from '../time/time.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker' | 'kiosk-user';
  };
};

@Controller('projects')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly timeService: TimeService,
  ) {}

  @Get()
  @Roles(
    RoleCode.SUPERADMIN,
    RoleCode.OFFICE,
    RoleCode.PROJECT_MANAGER,
    RoleCode.WORKER,
  )
  @KioskAllowed()
  @Permissions('projects.view')
  // User-Tokens (Office/PM/Admin) muessen `projects.view` halten — sonst
  // 403. Worker und Kiosk-User haben keine fein-granularen Permissions
  // und werden dafuer per Token-Typ-Bypass am Handler durchgelassen; ihr
  // Zugriff wird durch die Body-Branches (`listForWorker`, `listForManager`)
  // weiter eingegrenzt.
  @PermissionsBypassForTokenTypes('worker', 'kiosk-user')
  list(@Req() request: RequestWithUser) {
    if (request.user?.type === 'worker') {
      return this.projectsService.listForWorker(request.user.sub);
    }
    if (request.user?.type === 'kiosk-user') {
      return this.projectsService.listForManager(request.user.sub);
    }
    return this.projectsService.list();
  }

  // ── Statische Sub-Routen MUESSEN vor `:id` stehen, sonst matcht Express
  // ── `id="export"` gegen die `:id`-Route (404). ─────────────────────────

  @Get('export/ical')
  @Permissions('projects.view')
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

  @Get(':id')
  @Roles(
    RoleCode.SUPERADMIN,
    RoleCode.OFFICE,
    RoleCode.PROJECT_MANAGER,
    RoleCode.WORKER,
  )
  @KioskAllowed()
  @Permissions('projects.view')
  // Office/PM/Admin brauchen `projects.view` (sonst 403). Worker und
  // Kiosk-User passieren ueber Token-Typ-Bypass; ihre Zugriffsgrenze
  // setzt der Service: Worker via `getByIdForWorker` (nur zugewiesene),
  // Kiosk via `getByIdForManager` (nur eigene).
  @PermissionsBypassForTokenTypes('worker', 'kiosk-user')
  getById(@Param('id') id: string, @Req() request: RequestWithUser) {
    if (request.user?.type === 'worker') {
      return this.projectsService.getByIdForWorker(id, request.user.sub);
    }
    if (request.user?.type === 'kiosk-user') {
      // Kiosk-User darf nur Projekte sehen, fuer die er als interner
      // Projektmanager hinterlegt ist. Sonst NotFound (statt 403, damit
      // wir keine Existenz-Information leaken — konsistent mit dem
      // bestehenden Sicherheitsmodell der Worker-Pfade).
      return this.projectsService.getByIdForManager(id, request.user.sub);
    }
    return this.projectsService.getById(id);
  }

  @Post()
  @Permissions('projects.create')
  create(@Body() dto: SaveProjectDto) {
    return this.projectsService.create(dto);
  }

  @Patch(':id')
  @Permissions('projects.edit')
  update(@Param('id') id: string, @Body() dto: SaveProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Get(':id/financials')
  @Permissions('projects.view')
  getFinancials(@Param('id') id: string) {
    return this.projectsService.getFinancials(id);
  }

  /** Live-Zeiterfassung je zugeordnetem Monteur (Bueromodus). */
  @Get(':id/assignment-time-summary')
  @Permissions('projects.view')
  getAssignmentTimeSummary(@Param('id') id: string) {
    return this.timeService.getProjectAssignmentTimeSummary(id);
  }

  @Post(':id/assignments')
  @Permissions('projects.edit')
  assignWorker(@Param('id') id: string, @Body() dto: AssignWorkerDto) {
    return this.projectsService.assignWorker(id, dto);
  }

  @Put(':id/assignments')
  @Permissions('projects.edit')
  setAssignments(
    @Param('id') id: string,
    @Body() body: { workerIds: string[]; startDate: string; endDate?: string },
  ) {
    return this.projectsService.setAssignments(id, body);
  }

  @Post(':id/billing-ready')
  @Permissions('projects.edit')
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
  @Permissions('projects.delete')
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
