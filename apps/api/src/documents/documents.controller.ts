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
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker';
  };
};

@Controller('documents')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.documentsService.list(entityType, entityId);
  }

  @Post('upload')
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
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @Req() request: RequestWithUser,
  ) {
    const uploadedByUserId =
      request.user?.type === 'user' ? request.user.sub : undefined;

    return this.documentsService.create(file, dto, uploadedByUserId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UploadDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() response: Response) {
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
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
