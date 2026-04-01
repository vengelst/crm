import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentApprovalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  private readonly documentInclude = {
    links: true,
    uploadedBy: {
      select: {
        id: true,
        displayName: true,
        email: true,
      },
    },
    uploadedByWorker: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        workerNumber: true,
      },
    },
  } as const;

  async list(entityType?: string, entityId?: string) {
    const documents = await this.prisma.document.findMany({
      include: this.documentInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!entityType && !entityId) {
      return documents;
    }

    return documents.filter((document) =>
      document.links.some(
        (link) =>
          (!entityType || link.entityType === entityType) &&
          (!entityId || link.entityId === entityId),
      ),
    );
  }

  async listForKiosk(
    userId: string,
    userType: 'worker' | 'kiosk-user',
    entityType?: string,
    entityId?: string,
  ) {
    // Ermittle erlaubte Projekt-IDs anhand der Zuordnungen
    let allowedProjectIds: string[];

    if (userType === 'worker') {
      const assignments = await this.prisma.projectAssignment.findMany({
        where: { workerId: userId, active: true },
        select: { projectId: true },
      });
      allowedProjectIds = assignments.map((a) => a.projectId);
    } else {
      // kiosk-user: nur Projekte, die diesem Benutzer als Projektleiter zugeordnet sind
      const projects = await this.prisma.project.findMany({
        where: {
          deletedAt: null,
          internalProjectManagerUserId: userId,
        },
        select: { id: true },
      });
      allowedProjectIds = projects.map((p) => p.id);
    }

    const allowedSet = new Set(allowedProjectIds);

    // Wenn entityType und entityId angegeben: pruefen ob erlaubt
    if (entityType === 'PROJECT' && entityId) {
      if (!allowedSet.has(entityId)) {
        return [];
      }
    }

    const documents = await this.prisma.document.findMany({
      where: {
        links: {
          some: {
            entityType: 'PROJECT',
            entityId: { in: allowedProjectIds },
          },
        },
      },
      include: this.documentInclude,
      orderBy: { createdAt: 'desc' },
    });

    // Zusaetzlich nach entityType/entityId filtern falls angegeben
    if (entityType || entityId) {
      return documents.filter((document) =>
        document.links.some(
          (link) =>
            (!entityType || link.entityType === entityType) &&
            (!entityId || link.entityId === entityId),
        ),
      );
    }

    return documents;
  }

  /**
   * Create a new document.
   * File arrives as in-memory buffer (memoryStorage) and is uploaded to MinIO.
   */
  async create(
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
    uploadedByUserId?: string,
    uploadedByWorkerId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is missing.');
    }

    const storageKey = this.buildStorageKey(file.originalname);

    await this.storage.uploadObject(
      storageKey,
      file.buffer,
      file.size,
      file.mimetype,
    );

    return this.prisma.document.create({
      data: {
        storageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedByUserId,
        uploadedByWorkerId,
        documentType: dto.documentType,
        title: dto.title,
        description: dto.description,
        links:
          dto.entityType && dto.entityId
            ? {
                create: [
                  {
                    entityType: dto.entityType,
                    entityId: dto.entityId,
                  },
                  ...(uploadedByWorkerId &&
                  !(
                    dto.entityType === 'WORKER' &&
                    dto.entityId === uploadedByWorkerId
                  )
                    ? [
                        {
                          entityType: 'WORKER',
                          entityId: uploadedByWorkerId,
                        },
                      ]
                    : []),
                ],
              }
            : undefined,
      },
      include: this.documentInclude,
    });
  }

  async assertProjectAssignment(workerId: string, projectId: string) {
    const assignment = await this.prisma.projectAssignment.findFirst({
      where: { workerId, projectId, active: true },
    });
    if (!assignment) {
      throw new BadRequestException('No assignment to this project.');
    }
  }

  /** Check that a kiosk-user manages the given project (for upload scope). */
  async assertKioskProjectAccess(userId: string, projectId: string) {
    const managedProjects = await this.prisma.project.findMany({
      where: { deletedAt: null, internalProjectManagerUserId: userId },
      select: { id: true },
    });
    if (!managedProjects.some((p) => p.id === projectId)) {
      throw new BadRequestException('No access to this project.');
    }
  }

  async assertKioskAccess(
    documentId: string,
    userId: string,
    userType: 'worker' | 'kiosk-user',
  ) {
    const document = await this.getById(documentId);

    if (userType === 'worker') {
      const assignments = await this.prisma.projectAssignment.findMany({
        where: { workerId: userId, active: true },
        select: { projectId: true },
      });
      const allowedProjectIds = new Set(assignments.map((a) => a.projectId));
      const hasAccess = document.links.some(
        (link) =>
          link.entityType === 'PROJECT' && allowedProjectIds.has(link.entityId),
      );
      if (!hasAccess) {
        throw new NotFoundException('Document not found.');
      }
    } else if (userType === 'kiosk-user') {
      // kiosk-user: nur Dokumente von Projekten, die diesem Benutzer zugeordnet sind
      const managedProjects = await this.prisma.project.findMany({
        where: {
          deletedAt: null,
          internalProjectManagerUserId: userId,
        },
        select: { id: true },
      });
      const managedIds = new Set(managedProjects.map((p) => p.id));
      const hasAccess = document.links.some(
        (link) =>
          link.entityType === 'PROJECT' && managedIds.has(link.entityId),
      );
      if (!hasAccess) {
        throw new NotFoundException('Document not found.');
      }
    }
  }

  /**
   * Replace the file for an existing document.
   * File arrives as in-memory buffer. Old MinIO object is deleted,
   * with a silent fallback that also cleans up any local legacy file.
   */
  async replaceFile(id: string, file: Express.Multer.File) {
    const document = await this.getById(id);

    // Nur in DRAFT oder REJECTED ersetzen erlaubt
    const status = document.approvalStatus as string;
    if (status !== 'DRAFT' && status !== 'REJECTED') {
      throw new BadRequestException(
        'Document cannot be replaced after submission or approval.',
      );
    }

    // Altes Objekt loeschen (MinIO + lokaler Fallback)
    await this.deleteStorageObject(document.storageKey);

    const newStorageKey = this.buildStorageKey(file.originalname);

    await this.storage.uploadObject(
      newStorageKey,
      file.buffer,
      file.size,
      file.mimetype,
    );

    return this.prisma.document.update({
      where: { id },
      data: {
        storageKey: newStorageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
      include: this.documentInclude,
    });
  }

  private assertStatusTransition(
    current: DocumentApprovalStatus,
    next: DocumentApprovalStatus,
  ) {
    const allowed: Record<string, string[]> = {
      DRAFT: ['SUBMITTED'],
      SUBMITTED: ['APPROVED', 'REJECTED'],
      APPROVED: ['ARCHIVED'],
      REJECTED: ['SUBMITTED', 'ARCHIVED'],
      ARCHIVED: [],
    };
    if (!(allowed[current] ?? []).includes(next)) {
      throw new BadRequestException(
        `Status transition from ${current} to ${next} is not allowed.`,
      );
    }
  }

  async setApprovalStatus(
    id: string,
    status: DocumentApprovalStatus,
    userId?: string,
    comment?: string,
  ) {
    const doc = await this.getById(id);
    this.assertStatusTransition(doc.approvalStatus, status);
    const result = await this.prisma.document.update({
      where: { id },
      data: {
        approvalStatus: status,
        approvedAt:
          status === 'APPROVED' || status === 'REJECTED'
            ? new Date()
            : undefined,
        approvedByUserId:
          status === 'APPROVED' || status === 'REJECTED' ? userId : undefined,
        approvalComment: comment,
      },
      include: this.documentInclude,
    });

    if (status === 'APPROVED' || status === 'REJECTED') {
      void this.notifications.onDocumentApproval(
        id,
        doc.title ?? doc.originalFilename,
        status,
        doc.uploadedByWorkerId,
      );
    }

    return result;
  }

  async getById(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: this.documentInclude,
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    return document;
  }

  async update(id: string, dto: UploadDocumentDto) {
    await this.getById(id);

    return this.prisma.document.update({
      where: { id },
      data: {
        documentType: dto.documentType,
        title: dto.title,
        description: dto.description,
      },
      include: this.documentInclude,
    });
  }

  /**
   * Get a readable stream for a document file.
   * Uses StorageService with centralized local fallback (controlled by
   * STORAGE_LOCAL_FALLBACK env var).
   */
  async getFileStream(id: string): Promise<{
    stream: Readable;
    document: Awaited<ReturnType<DocumentsService['getById']>>;
  }> {
    const document = await this.getById(id);

    const stream = await this.storage.getObjectStreamWithFallback(
      document.storageKey,
    );
    if (stream) {
      return { stream, document };
    }

    throw new NotFoundException('File not found in storage.');
  }

  /**
   * Delete a document and its stored file (MinIO + local legacy fallback).
   */
  async remove(id: string) {
    const document = await this.getById(id);

    await this.deleteStorageObject(document.storageKey);

    await this.prisma.documentLink.deleteMany({
      where: { documentId: id },
    });

    return this.prisma.document.delete({
      where: { id: document.id },
    });
  }

  // ── Private helpers ───────────────────────────────────

  /** Generate a unique storage key for a new upload. */
  private buildStorageKey(originalFilename: string): string {
    const ext = extname(originalFilename);
    return `uploads/${Date.now()}-${randomUUID()}${ext}`;
  }

  /**
   * Delete a file from MinIO (+ local legacy if STORAGE_LOCAL_FALLBACK is on).
   * Delegates to the centralized StorageService.deleteObjectWithFallback().
   */
  private async deleteStorageObject(storageKey: string): Promise<void> {
    await this.storage.deleteObjectWithFallback(storageKey);
  }
}
