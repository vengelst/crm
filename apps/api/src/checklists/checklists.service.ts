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
    data: { completed: boolean; comment?: string; completedByName?: string; completedById?: string },
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
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Vorlage nicht gefunden.');

    return this.prisma.projectChecklist.create({
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
  }
}
