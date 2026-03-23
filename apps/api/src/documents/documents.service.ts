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

  async list(entityType?: string, entityId?: string) {
    const documents = await this.prisma.document.findMany({
      include: {
        links: true,
      },
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

  async create(
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
    uploadedByUserId?: string,
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
        documentType: dto.documentType,
        title: dto.title,
        description: dto.description,
        links:
          dto.entityType && dto.entityId
            ? {
                create: {
                  entityType: dto.entityType,
                  entityId: dto.entityId,
                },
              }
            : undefined,
      },
      include: {
        links: true,
      },
    });
  }

  async getById(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        links: true,
      },
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
      include: {
        links: true,
      },
    });
  }

  async getFilePath(id: string) {
    const document = await this.getById(id);
    const absolutePath = resolve(process.cwd(), 'storage', document.storageKey);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Datei auf Storage nicht gefunden.');
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
