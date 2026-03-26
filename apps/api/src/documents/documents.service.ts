import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

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
      // kiosk-user: alle Projekte sichtbar (Rolle PROJECT_MANAGER)
      const projects = await this.prisma.project.findMany({
        where: { deletedAt: null },
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

  async create(
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
    uploadedByUserId?: string,
    uploadedByWorkerId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }

    const storageKey = join('uploads', file.filename).replaceAll('\\', '/');

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
                  !(dto.entityType === 'WORKER' && dto.entityId === uploadedByWorkerId)
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
      throw new BadRequestException(
        'Keine Zuordnung zu diesem Projekt vorhanden.',
      );
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
      const allowedProjectIds = new Set(
        assignments.map((a) => a.projectId),
      );
      const hasAccess = document.links.some(
        (link) =>
          link.entityType === 'PROJECT' && allowedProjectIds.has(link.entityId),
      );
      if (!hasAccess) {
        throw new NotFoundException('Dokument nicht gefunden.');
      }
    }
    // kiosk-user mit PROJECT_MANAGER sieht alle Projektdokumente
  }

  async getById(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: this.documentInclude,
    });

    if (!document) {
      throw new NotFoundException('Dokument nicht gefunden.');
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

  async getFilePath(id: string) {
    const document = await this.getById(id);
    const absolutePath = resolve(process.cwd(), 'storage', document.storageKey);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException(
        'Datei im Storage nicht vorhanden. In der lokalen Dev-Umgebung muss die Datei erst hochgeladen werden.',
      );
    }

    return {
      document,
      absolutePath,
    };
  }

  ensureUploadDirectory() {
    const uploadDir = resolve(process.cwd(), 'storage', 'uploads');

    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    return uploadDir;
  }

  async remove(id: string) {
    const { document, absolutePath } = await this.getFilePath(id);

    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }

    await this.prisma.documentLink.deleteMany({
      where: {
        documentId: id,
      },
    });

    return this.prisma.document.delete({
      where: {
        id: document.id,
      },
    });
  }
}
