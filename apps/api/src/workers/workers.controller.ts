import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RoleCode } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { SaveWorkerDto } from './dto/save-worker.dto';
import { WorkersService } from './workers.service';

@Controller('workers')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  list() {
    return this.workersService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.workersService.getById(id);
  }

  @Post()
  create(@Body() dto: SaveWorkerDto) {
    return this.workersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveWorkerDto) {
    return this.workersService.update(id, dto);
  }

  @Post(':id/pin/reset')
  resetPin(@Param('id') id: string, @Body('pin') pin: string) {
    return this.workersService.resetPin(id, pin);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workersService.remove(id);
  }

  // ── Profilbild ─────────────────────────────────────
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.workersService.setPhoto(id, file);
  }

  @Delete(':id/photo')
  deletePhoto(@Param('id') id: string) {
    return this.workersService.deletePhoto(id);
  }

  @Get(':id/photo/file')
  @Roles(
    RoleCode.SUPERADMIN,
    RoleCode.OFFICE,
    RoleCode.PROJECT_MANAGER,
    RoleCode.WORKER,
  )
  async servePhotoFile(@Param('id') id: string, @Res() res: Response) {
    const { stream, contentType } =
      await this.workersService.getPhotoStream(id);
    if (!stream) {
      res.status(404).json({ message: 'Kein Profilbild vorhanden.' });
      return;
    }
    if (contentType) res.setHeader('Content-Type', contentType);
    stream.pipe(res);
  }
}
