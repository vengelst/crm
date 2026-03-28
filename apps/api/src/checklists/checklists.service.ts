import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly checklistInclude = {
    items: { orderBy: { sortOrder: 'asc' as const } },
  };

  // ── Project Checklists ──────────────────────────

  listByProject(projectId: string) {
    return this.prisma.projectChecklist.findMany({
      where: { projectId },
      include: this.checklistInclude,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createChecklist(
    projectId: string,
    data: { name: string; description?: string },
  ) {
    return this.prisma.projectChecklist.create({
      data: {
        projectId,
        name: data.name,
        description: data.description,
      },
      include: this.checklistInclude,
    });
  }

  async updateChecklist(
    id: string,
    data: { name?: string; description?: string; sortOrder?: number },
  ) {
    return this.prisma.projectChecklist.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        sortOrder: data.sortOrder,
      },
      include: this.checklistInclude,
    });
  }

  async removeChecklist(id: string) {
    const completedCount = await this.prisma.projectChecklistItem.count({
      where: { checklistId: id, completed: true },
    });
    if (completedCount > 0) {
      throw new BadRequestException(
        `Checkliste enthaelt ${completedCount} erledigte Punkt(e). Bitte zuerst die Erledigungen zuruecksetzen.`,
      );
    }
    return this.prisma.projectChecklist.delete({ where: { id } });
  }

  // ── Checklist Items ─────────────────────────────

  async addItem(
    checklistId: string,
    data: { title: string; description?: string; sortOrder?: number },
  ) {
    return this.prisma.projectChecklistItem.create({
      data: {
        checklistId,
        title: data.title,
        description: data.description,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updateItem(
    id: string,
    data: {
      title?: string;
      description?: string;
      sortOrder?: number;
    },
  ) {
    return this.prisma.projectChecklistItem.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        sortOrder: data.sortOrder,
      },
    });
  }

  async removeItem(id: string, force = false) {
    const item = await this.prisma.projectChecklistItem.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('Checklistenpunkt nicht gefunden.');

    if (item.completed && !force) {
      throw new BadRequestException(
        'Erledigte Checklistenpunkte koennen nicht geloescht werden. Bitte zuerst die Erledigung zuruecksetzen.',
      );
    }

    return this.prisma.projectChecklistItem.delete({ where: { id } });
  }

  async completeItem(
    id: string,
    data: {
      completed: boolean;
      comment?: string;
      completedByName?: string;
      completedById?: string;
    },
  ) {
    return this.prisma.projectChecklistItem.update({
      where: { id },
      data: {
        completed: data.completed,
        completedAt: data.completed ? new Date() : null,
        completedByName: data.completed ? data.completedByName : null,
        completedById: data.completed ? data.completedById : null,
        comment: data.comment,
      },
    });
  }

  async getChecklistWithProject(checklistId: string) {
    const checklist = await this.prisma.projectChecklist.findUnique({
      where: { id: checklistId },
      select: { id: true, projectId: true },
    });
    if (!checklist) throw new NotFoundException('Checkliste nicht gefunden.');
    return checklist;
  }

  async getItemWithProject(itemId: string) {
    const item = await this.prisma.projectChecklistItem.findUnique({
      where: { id: itemId },
      include: { checklist: { select: { projectId: true } } },
    });
    if (!item) throw new NotFoundException('Checklistenpunkt nicht gefunden.');
    return { ...item, projectId: item.checklist.projectId };
  }

  // ── Templates ───────────────────────────────────

  listTemplates() {
    return this.prisma.checklistTemplate.findMany({
      include: { items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(data: { name: string; description?: string }) {
    return this.prisma.checklistTemplate.create({
      data: { name: data.name, description: data.description },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateTemplate(
    id: string,
    data: { name?: string; description?: string },
  ) {
    return this.prisma.checklistTemplate.update({
      where: { id },
      data: { name: data.name, description: data.description },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async removeTemplate(id: string) {
    return this.prisma.checklistTemplate.delete({ where: { id } });
  }

  async addTemplateItem(
    templateId: string,
    data: { title: string; description?: string; sortOrder?: number },
  ) {
    return this.prisma.checklistTemplateItem.create({
      data: {
        templateId,
        title: data.title,
        description: data.description,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updateTemplateItem(
    id: string,
    data: { title?: string; description?: string; sortOrder?: number },
  ) {
    return this.prisma.checklistTemplateItem.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        sortOrder: data.sortOrder,
      },
    });
  }

  async removeTemplateItem(id: string) {
    return this.prisma.checklistTemplateItem.delete({ where: { id } });
  }

  async applyTemplate(templateId: string, projectId: string) {
    const template = await this.prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        notices: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!template) throw new NotFoundException('Vorlage nicht gefunden.');

    const checklist = await this.prisma.projectChecklist.create({
      data: {
        projectId,
        name: template.name,
        description: template.description,
        items: {
          create: template.items.map((item) => ({
            title: item.title,
            description: item.description,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: this.checklistInclude,
    });

    // Hinweistexte als Projektkopien uebernehmen
    if (template.notices.length > 0) {
      await this.prisma.projectNotice.createMany({
        data: template.notices.map((n) => ({
          projectId,
          sourceTemplateId: templateId,
          sourceTemplateNoticeId: n.id,
          title: n.title,
          body: n.body,
          sortOrder: n.sortOrder,
          required: n.required,
          requireSignature: n.requireSignature,
        })),
      });
    }

    return checklist;
  }

  // ── Template Notices ──────────────────────────

  listTemplateNotices(templateId: string) {
    return this.prisma.checklistTemplateNotice.findMany({
      where: { templateId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addTemplateNotice(
    templateId: string,
    data: {
      title: string;
      body: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    return this.prisma.checklistTemplateNotice.create({
      data: {
        templateId,
        title: data.title,
        body: data.body,
        sortOrder: data.sortOrder ?? 0,
        required: data.required ?? false,
        requireSignature: data.requireSignature ?? false,
      },
    });
  }

  async updateTemplateNotice(
    id: string,
    data: {
      title?: string;
      body?: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    return this.prisma.checklistTemplateNotice.update({
      where: { id },
      data,
    });
  }

  async removeTemplateNotice(id: string) {
    return this.prisma.checklistTemplateNotice.delete({ where: { id } });
  }

  // ── Project Notices ───────────────────────────

  listProjectNotices(projectId: string) {
    return this.prisma.projectNotice.findMany({
      where: { projectId, active: true },
      include: {
        acknowledgements: {
          include: {
            worker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                workerNumber: true,
              },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createProjectNotice(
    projectId: string,
    data: {
      title: string;
      body: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    return this.prisma.projectNotice.create({
      data: {
        projectId,
        ...data,
        sortOrder: data.sortOrder ?? 0,
        required: data.required ?? false,
        requireSignature: data.requireSignature ?? false,
      },
    });
  }

  async updateProjectNotice(
    id: string,
    data: {
      title?: string;
      body?: string;
      sortOrder?: number;
      required?: boolean;
      requireSignature?: boolean;
    },
  ) {
    const notice = await this.prisma.projectNotice.findUnique({
      where: { id },
    });
    if (!notice) throw new NotFoundException('Hinweis nicht gefunden.');

    // Bei relevanter Textaenderung alte Bestaetigungen zuruecksetzen
    const textChanged =
      (data.title && data.title !== notice.title) ||
      (data.body && data.body !== notice.body);

    const result = await this.prisma.projectNotice.update({
      where: { id },
      data,
    });

    if (textChanged) {
      await this.prisma.projectNoticeAcknowledgement.deleteMany({
        where: { projectNoticeId: id },
      });
    }

    return result;
  }

  async removeProjectNotice(id: string) {
    return this.prisma.projectNotice.update({
      where: { id },
      data: { active: false },
    });
  }

  async acknowledgeNotice(
    noticeId: string,
    workerId: string,
    projectId: string,
    data: { signatureImagePath?: string; comment?: string },
  ) {
    return this.prisma.projectNoticeAcknowledgement.upsert({
      where: {
        projectNoticeId_workerId: { projectNoticeId: noticeId, workerId },
      },
      create: {
        projectNoticeId: noticeId,
        projectId,
        workerId,
        acknowledged: true,
        acknowledgedAt: new Date(),
        signatureImagePath: data.signatureImagePath,
        comment: data.comment,
      },
      update: {
        acknowledged: true,
        acknowledgedAt: new Date(),
        signatureImagePath: data.signatureImagePath,
        comment: data.comment,
      },
    });
  }
}
