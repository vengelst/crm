import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
@Roles(
  RoleCode.SUPERADMIN,
  RoleCode.OFFICE,
  RoleCode.PROJECT_MANAGER,
  RoleCode.WORKER,
)
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
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @Req() request: RequestWithUser,
  ) {
    // Worker: nur Projekt-Dokumente fuer zugewiesene Projekte
    if (request.user?.type === 'worker') {
      if (dto.entityType !== 'PROJECT' || !dto.entityId) {
        throw new BadRequestException(
          'Monteure duerfen nur Projektdokumente hochladen.',
        );
      }
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

    const { stream, document } =
      await this.documentsService.getFileStream(id);

    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.originalFilename)}"`,
    );

    stream.pipe(response);
  }

  @Put(':id/replace')
  @KioskAllowed()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async replaceFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: RequestWithUser,
  ) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }

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

    return this.documentsService.replaceFile(id, file);
  }

  @Post(':id/submit')
  @KioskAllowed()
  async submit(@Param('id') id: string, @Req() request: RequestWithUser) {
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
    return this.documentsService.setApprovalStatus(id, 'SUBMITTED');
  }

  @Post(':id/approve')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  approve(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Req() request: RequestWithUser,
  ) {
    return this.documentsService.setApprovalStatus(
      id,
      'APPROVED',
      request.user?.sub,
      body.comment,
    );
  }

  @Post(':id/reject')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  reject(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Req() request: RequestWithUser,
  ) {
    return this.documentsService.setApprovalStatus(
      id,
      'REJECTED',
      request.user?.sub,
      body.comment,
    );
  }

  @Post(':id/archive')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  archive(@Param('id') id: string) {
    return this.documentsService.setApprovalStatus(id, 'ARCHIVED');
  }

  @Delete(':id')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
