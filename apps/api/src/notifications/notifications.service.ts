import { Injectable } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Lesen ────────────────────────────────────

  listForUser(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { recipientUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  listForWorker(workerId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { recipientWorkerId: workerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async countUnread(recipientType: 'user' | 'worker', recipientId: string) {
    return this.prisma.notification.count({
      where: {
        ...(recipientType === 'user'
          ? { recipientUserId: recipientId }
          : { recipientWorkerId: recipientId }),
        read: false,
      },
    });
  }

  async getById(id: string) {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllRead(recipientType: 'user' | 'worker', recipientId: string) {
    return this.prisma.notification.updateMany({
      where: {
        ...(recipientType === 'user'
          ? { recipientUserId: recipientId }
          : { recipientWorkerId: recipientId }),
        read: false,
      },
      data: { read: true, readAt: new Date() },
    });
  }

  // ── Erzeugen ─────────────────────────────────

  async notifyWorker(
    workerId: string,
    type: string,
    title: string,
    body?: string,
    linkType?: string,
    linkId?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        recipientType: 'worker',
        recipientWorkerId: workerId,
        type,
        title,
        body,
        linkType,
        linkId,
      },
    });
  }

  async notifyUser(
    userId: string,
    type: string,
    title: string,
    body?: string,
    linkType?: string,
    linkId?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        recipientType: 'user',
        recipientUserId: userId,
        type,
        title,
        body,
        linkType,
        linkId,
      },
    });
  }

  async notifyAdmins(
    type: string,
    title: string,
    body?: string,
    linkType?: string,
    linkId?: string,
  ) {
    const admins = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              code: { in: [RoleCode.SUPERADMIN, RoleCode.OFFICE] },
            },
          },
        },
      },
      select: { id: true },
    });

    if (admins.length === 0) return;

    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        recipientType: 'user',
        recipientUserId: admin.id,
        type,
        title,
        body,
        linkType,
        linkId,
      })),
    });
  }

  // ── Event-Helfer ─────────────────────────────

  async onProjectAssignment(
    workerId: string,
    projectNumber: string,
    projectTitle: string,
    projectId: string,
  ) {
    await this.notifyWorker(
      workerId,
      'ASSIGNMENT',
      'Neue Projektzuordnung',
      `Du wurdest dem Projekt ${projectNumber} — ${projectTitle} zugeordnet.`,
      'PROJECT',
      projectId,
    );
  }

  async onTimesheetSigned(
    projectId: string,
    signerType: string,
    signerName: string,
    projectNumber: string,
    weekLabel: string,
  ) {
    const title =
      signerType === 'WORKER'
        ? `Stundenzettel ${weekLabel} signiert`
        : `Kundenunterschrift ${weekLabel}`;
    const body = `${signerName} hat den Stundenzettel fuer ${projectNumber} (${weekLabel}) signiert.`;

    await this.notifyAdmins(
      'SIGNATURE',
      title,
      body,
      'PROJECT',
      projectId,
    );
  }

  async onTimesheetApproved(
    projectId: string,
    projectNumber: string,
    weekLabel: string,
    workerId: string,
  ) {
    await this.notifyWorker(
      workerId,
      'APPROVAL',
      `Stundenzettel ${weekLabel} freigegeben`,
      `Dein Stundenzettel fuer ${projectNumber} (${weekLabel}) wurde intern freigegeben.`,
      'PROJECT',
      projectId,
    );
  }

  async onDocumentApproval(
    documentId: string,
    documentTitle: string,
    status: string,
    uploadedByWorkerId?: string | null,
    projectId?: string | null,
  ) {
    if (!uploadedByWorkerId) return;

    const statusText =
      status === 'APPROVED' ? 'freigegeben' : 'abgelehnt';

    await this.notifyWorker(
      uploadedByWorkerId,
      'APPROVAL',
      `Dokument ${statusText}`,
      `Dein Dokument "${documentTitle}" wurde ${statusText}.`,
      'PROJECT',
      projectId ?? undefined,
    );
  }

  async onBillingReady(projectId: string, projectNumber: string, projectTitle: string) {
    await this.notifyAdmins(
      'APPROVAL',
      `Projekt ${projectNumber} abrechnungsbereit`,
      `Das Projekt "${projectTitle}" wurde als abrechnungsbereit markiert.`,
      'PROJECT',
      projectId,
    );
  }
}
