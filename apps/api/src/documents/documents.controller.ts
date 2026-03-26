import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { KioskAllowed } from '../common/decorators/kiosk-allowed.decorator';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker' | 'kiosk-user';
  };
};

@Controller('documents')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER, RoleCode.WORKER)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @KioskAllowed()
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Req() request?: RequestWithUser,
  ) {
    // Worker und kiosk-user: nur Dokumente zugewiesener Projekte
    if (
      request?.user?.type === 'worker' ||
      request?.user?.type === 'kiosk-user'
    ) {
      return this.documentsService.listForKiosk(
        request.user.sub,
        request.user.type,
        entityType,
        entityId,
      );
    }
    return this.documentsService.list(entityType, entityId);
  }

  @Post('upload')
  @KioskAllowed()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          const uploadDir = resolve(process.cwd(), 'storage', 'uploads');

          if (!existsSync(uploadDir)) {
            mkdirSync(uploadDir, { recursive: true });
          }

          callback(null, uploadDir);
        },
        filename: (_request, file, callback) => {
          callback(
            null,
            `${Date.now()}-${randomUUID()}${extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @Req() request: RequestWithUser,
  ) {
    // Worker duerfen nur fuer ihre Projekte hochladen
    if (request.user?.type === 'worker' && dto.entityType === 'PROJECT' && dto.entityId) {
      await this.documentsService.assertProjectAssignment(
        request.user.sub,
        dto.entityId,
      );
    }

    const uploadedByUserId =
      request.user?.type === 'user' || request.user?.type === 'kiosk-user'
        ? request.user.sub
        : undefined;
    const uploadedByWorkerId =
      request.user?.type === 'worker' ? request.user.sub : undefined;

    return this.documentsService.create(
      file,
      dto,
      uploadedByUserId,
      uploadedByWorkerId,
    );
  }

  @Patch(':id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UploadDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @Get(':id/download')
  @KioskAllowed()
  async download(
    @Param('id') id: string,
    @Res() response: Response,
    @Req() request: RequestWithUser,
  ) {
    // Scope-Pruefung fuer Worker und kiosk-user
    if (
      request.user?.type === 'worker' ||
      request.user?.type === 'kiosk-user'
    ) {
      await this.documentsService.assertKioskAccess(
        id,
        request.user.sub,
        request.user.type,
      );
    }

    const { absolutePath, document } =
      await this.documentsService.getFilePath(id);

    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.originalFilename)}"`,
    );

    return response.sendFile(absolutePath);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
