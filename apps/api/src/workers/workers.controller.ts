import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RoleCode } from '@prisma/client';
import type { Request, Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsBypassForTokenTypes } from '../common/decorators/permissions-bypass.decorator';
import { SaveWorkerDto } from './dto/save-worker.dto';
import { WorkersService } from './workers.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker' | 'kiosk-user' | 'emergency-admin';
  };
};

@Controller('workers')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  @Permissions('workers.view')
  list() {
    return this.workersService.list();
  }

  @Get(':id')
  @Permissions('workers.view')
  getById(@Param('id') id: string) {
    return this.workersService.getById(id);
  }

  @Post()
  @Permissions('workers.create')
  create(@Body() dto: SaveWorkerDto) {
    return this.workersService.create(dto);
  }

  @Patch(':id')
  @Permissions('workers.edit')
  update(@Param('id') id: string, @Body() dto: SaveWorkerDto) {
    return this.workersService.update(id, dto);
  }

  @Post(':id/pin/reset')
  @Permissions('workers.edit')
  resetPin(@Param('id') id: string, @Body('pin') pin: string) {
    return this.workersService.resetPin(id, pin);
  }

  @Delete('bulk')
  @Roles(RoleCode.SUPERADMIN)
  @Permissions('workers.delete')
  removeMany(@Body() body: { ids: string[] }, @Query('force') force?: string) {
    const forceDelete = force === 'true' || force === '1';
    return this.workersService.removeMany(body.ids ?? [], forceDelete);
  }

  @Delete(':id')
  @Permissions('workers.delete')
  remove(@Param('id') id: string, @Query('force') force?: string) {
    const forceDelete = force === 'true' || force === '1';
    return this.workersService.remove(id, forceDelete);
  }

  // ── Profilbild ─────────────────────────────────────
  @Post(':id/photo')
  @Permissions('workers.edit')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.workersService.setPhoto(id, file);
  }

  @Delete(':id/photo')
  @Permissions('workers.edit')
  deletePhoto(@Param('id') id: string) {
    return this.workersService.deletePhoto(id);
  }

  /**
   * Profilbild ausliefern.
   *
   * Berechtigungsmodell:
   *  - Office/PM/Admin (User-Token): brauchen `workers.view`.
   *  - Worker-Token: darf NUR das eigene Foto lesen (`request.user.sub
   *    === id`). Sonst 403. Diese Token-Typ-Ausnahme ist explizit pro
   *    Handler via `@PermissionsBypassForTokenTypes('worker')` gesetzt
   *    und greift nur, weil der Handler-Body danach die ID-Pruefung
   *    erzwingt.
   *  - Kiosk-User: KEIN pauschaler Zugriff auf Worker-Profilbilder.
   *    Wer dies fachlich braucht, sollte das ueber einen Office-Account
   *    abbilden. Kiosk-User scheitern hier am `@Permissions`-Guard, weil
   *    sie nicht in der Bypass-Liste stehen.
   */
  @Get(':id/photo/file')
  @Roles(
    RoleCode.SUPERADMIN,
    RoleCode.OFFICE,
    RoleCode.PROJECT_MANAGER,
    RoleCode.WORKER,
  )
  @Permissions('workers.view')
  @PermissionsBypassForTokenTypes('worker')
  async servePhotoFile(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
    @Res() res: Response,
  ) {
    if (request.user?.type === 'worker' && request.user.sub !== id) {
      // Worker-Token darf ausschliesslich das eigene Foto lesen — sonst
      // bewusst 403 (klar, dass es um Berechtigung geht; Existenz wird
      // damit nicht direkt geleakt, da der Aufrufer i. d. R. die eigene
      // ID kennt und fremde IDs nicht anhand 403/404 unterscheiden kann).
      throw new ForbiddenException(
        'Zugriff auf fremdes Profilbild verweigert.',
      );
    }

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
