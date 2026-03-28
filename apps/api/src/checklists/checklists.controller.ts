import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { KioskAllowed } from '../common/decorators/kiosk-allowed.decorator';
import { ChecklistsService } from './checklists.service';
import { PrismaService } from '../prisma/prisma.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    workerId?: string;
    type: 'user' | 'worker' | 'kiosk-user';
  };
};

@Controller('checklists')
@Roles(
  RoleCode.SUPERADMIN,
  RoleCode.OFFICE,
  RoleCode.PROJECT_MANAGER,
  RoleCode.WORKER,
)
export class ChecklistsController {
  constructor(
    private readonly checklistsService: ChecklistsService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Project checklists ────────────────────────

  @Get('project/:projectId')
  @KioskAllowed()
  async listByProject(
    @Param('projectId') projectId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.assertProjectAccess(request, projectId);
    return this.checklistsService.listByProject(projectId);
  }

  @Post('project/:projectId')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  create(
    @Param('projectId') projectId: string,
    @Body() body: { name: string; description?: string },
  ) {
    return this.checklistsService.createChecklist(projectId, body);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; sortOrder?: number },
  ) {
    return this.checklistsService.updateChecklist(id, body);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.checklistsService.removeChecklist(id);
  }

  // ── Items ─────────────────────────────────────

  @Post(':checklistId/items')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  addItem(
    @Param('checklistId') checklistId: string,
    @Body() body: { title: string; description?: string; sortOrder?: number },
  ) {
    return this.checklistsService.addItem(checklistId, body);
  }

  @Patch('items/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  updateItem(
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; sortOrder?: number },
  ) {
    return this.checklistsService.updateItem(id, body);
  }

  @Delete('items/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  removeItem(@Param('id') id: string) {
    return this.checklistsService.removeItem(id);
  }

  @Post('items/:id/complete')
  @KioskAllowed()
  async completeItem(
    @Param('id') id: string,
    @Body() body: { completed: boolean; comment?: string },
    @Req() request: RequestWithUser,
  ) {
    const item = await this.checklistsService.getItemWithProject(id);
    await this.assertProjectAccess(request, item.projectId);

    // Worker/kiosk-user: nur erledigen, nicht ent-haken
    const isKiosk =
      request.user?.type === 'worker' || request.user?.type === 'kiosk-user';
    if (isKiosk && !body.completed && item.completed) {
      throw new ForbiddenException(
        'Erledigte Punkte koennen nur von einem Administrator zurueckgesetzt werden.',
      );
    }

    let resolvedName: string | undefined;
    if (request.user?.type === 'worker') {
      const worker = await this.prisma.worker.findUnique({
        where: { id: request.user.workerId ?? request.user.sub },
        select: { firstName: true, lastName: true },
      });
      resolvedName = worker
        ? `${worker.firstName} ${worker.lastName}`
        : undefined;
    } else if (request.user) {
      const user = await this.prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { displayName: true },
      });
      resolvedName = user?.displayName;
    }

    return this.checklistsService.completeItem(id, {
      completed: body.completed,
      comment: body.comment,
      completedByName: resolvedName,
      completedById: request.user?.sub,
    });
  }

  // ── Templates ─────────────────────────────────

  @Get('templates')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  listTemplates() {
    return this.checklistsService.listTemplates();
  }

  @Post('templates')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  createTemplate(@Body() body: { name: string; description?: string }) {
    return this.checklistsService.createTemplate(body);
  }

  @Patch('templates/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  updateTemplate(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.checklistsService.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  removeTemplate(@Param('id') id: string) {
    return this.checklistsService.removeTemplate(id);
  }

  @Post('templates/:templateId/items')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  addTemplateItem(
    @Param('templateId') templateId: string,
    @Body() body: { title: string; description?: string; sortOrder?: number },
  ) {
    return this.checklistsService.addTemplateItem(templateId, body);
  }

  @Patch('templates/items/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  updateTemplateItem(
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; sortOrder?: number },
  ) {
    return this.checklistsService.updateTemplateItem(id, body);
  }

  @Delete('templates/items/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  removeTemplateItem(@Param('id') id: string) {
    return this.checklistsService.removeTemplateItem(id);
  }

  @Post('templates/:templateId/apply/:projectId')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  applyTemplate(
    @Param('templateId') templateId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.checklistsService.applyTemplate(templateId, projectId);
  }

  // ── Template Notices ──────────────────────────

  @Get('templates/:templateId/notices')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  listTemplateNotices(@Param('templateId') templateId: string) {
    return this.checklistsService.listTemplateNotices(templateId);
  }

  @Post('templates/:templateId/notices')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  addTemplateNotice(
    @Param('templateId') templateId: string,
    @Body()
    body: {
      title: string;
      body: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    return this.checklistsService.addTemplateNotice(templateId, body);
  }

  @Patch('template-notices/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  updateTemplateNotice(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      body?: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    return this.checklistsService.updateTemplateNotice(id, body);
  }

  @Delete('template-notices/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  removeTemplateNotice(@Param('id') id: string) {
    return this.checklistsService.removeTemplateNotice(id);
  }

  // ── Project Notices ───────────────────────────

  @Get('notices/project/:projectId')
  @KioskAllowed()
  async listProjectNotices(
    @Param('projectId') projectId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.assertProjectAccess(request, projectId);
    return this.checklistsService.listProjectNotices(projectId);
  }

  @Post('notices/project/:projectId')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  createProjectNotice(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      title: string;
      body: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    return this.checklistsService.createProjectNotice(projectId, body);
  }

  @Patch('notices/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  updateProjectNotice(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      body?: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    return this.checklistsService.updateProjectNotice(id, body);
  }

  @Delete('notices/:id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  removeProjectNotice(@Param('id') id: string) {
    return this.checklistsService.removeProjectNotice(id);
  }

  @Post('notices/:id/acknowledge')
  @KioskAllowed()
  async acknowledgeNotice(
    @Param('id') id: string,
    @Body() body: { signatureImagePath?: string; comment?: string },
    @Req() request: RequestWithUser,
  ) {
    // Nur Monteure duerfen Hinweise bestaetigen/unterschreiben
    if (request.user?.type !== 'worker') {
      throw new ForbiddenException(
        'Nur Monteure koennen Baustellenhinweise bestaetigen.',
      );
    }

    const notice = await this.prisma.projectNotice.findUnique({
      where: { id },
      select: { projectId: true, requireSignature: true },
    });
    if (!notice) throw new ForbiddenException('Hinweis nicht gefunden.');
    await this.assertProjectAccess(request, notice.projectId);

    if (notice.requireSignature && !body.signatureImagePath) {
      throw new ForbiddenException(
        'Unterschrift ist fuer diesen Hinweis erforderlich.',
      );
    }

    const workerId = request.user.workerId ?? request.user.sub;

    return this.checklistsService.acknowledgeNotice(
      id,
      workerId,
      notice.projectId,
      body,
    );
  }

  // ── Helpers ───────────────────────────────────

  private async assertProjectAccess(
    request: RequestWithUser,
    projectId: string,
  ) {
    if (request.user?.type === 'worker') {
      const workerId = request.user.workerId ?? request.user.sub;
      const assignment = await this.prisma.projectAssignment.findFirst({
        where: { workerId, projectId, active: true },
      });
      if (!assignment) {
        throw new ForbiddenException('Kein Zugriff auf dieses Projekt.');
      }
    } else if (request.user?.type === 'kiosk-user') {
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          deletedAt: null,
          internalProjectManagerUserId: request.user.sub,
        },
      });
      if (!project) {
        throw new ForbiddenException('Kein Zugriff auf dieses Projekt.');
      }
    }
  }
}
