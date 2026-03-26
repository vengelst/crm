import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleCode } from '@prisma/client';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Get('smtp')
  getSmtp() {
    return this.settingsService.getSmtpConfig();
  }

  @Put('smtp')
  updateSmtp(
    @Body()
    dto: {
      host: string;
      port: number;
      user?: string;
      password?: string;
      fromEmail: string;
      secure: boolean;
    },
  ) {
    return this.settingsService.updateSmtpConfig(dto);
  }

  @Put('smtp/test')
  testSmtp(
    @Body()
    dto: {
      host: string;
      port: number;
      user?: string;
      password?: string;
      fromEmail: string;
      secure: boolean;
      recipient: string;
    },
  ) {
    return this.settingsService.sendSmtpTest(dto);
  }

  @Get('permissions')
  getPermissions() {
    return this.settingsService.getPermissions();
  }

  @Get('roles/:roleId/permissions')
  getRolePermissions(@Param('roleId') roleId: string) {
    return this.settingsService.getRolePermissions(roleId);
  }

  @Put('roles/:roleId/permissions')
  setRolePermissions(
    @Param('roleId') roleId: string,
    @Body() body: { permissionIds: string[] },
  ) {
    return this.settingsService.setRolePermissions(roleId, body.permissionIds);
  }

  @Get('company')
  getCompanyInfo() {
    return this.settingsService.getCompanyInfo();
  }

  @Put('company')
  updateCompanyInfo(@Body() dto: Record<string, string>) {
    return this.settingsService.updateCompanyInfo(dto);
  }

  @Get('pdf-config')
  getPdfConfig() {
    return this.settingsService.getPdfConfig();
  }

  @Put('pdf-config')
  updatePdfConfig(
    @Body()
    dto: {
      header: string;
      footer: string;
      extraText: string;
      useLogo: boolean;
    },
  ) {
    return this.settingsService.updatePdfConfig(dto);
  }

  // ── Logo ──────────────────────────────────────────
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = resolve(process.cwd(), 'storage', 'logo');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, `logo-${randomUUID()}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.settingsService.setLogo(file);
  }

  @Get('logo')
  getLogo() {
    return this.settingsService.getLogo();
  }

  @Delete('logo')
  deleteLogo() {
    return this.settingsService.deleteLogo();
  }

  @Get('logo/file')
  async serveLogoFile(@Res() res: Response) {
    const logo = await this.settingsService.getLogo();
    if (!logo.path) {
      res.status(404).json({ message: 'Kein Logo vorhanden.' });
      return;
    }
    const abs = resolve(process.cwd(), 'storage', logo.path);
    if (!existsSync(abs)) {
      res.status(404).json({ message: 'Logo-Datei nicht gefunden.' });
      return;
    }
    res.sendFile(abs);
  }

  // ── Backup ────────────────────────────────────────
  @Get('backup')
  getBackupConfig() {
    return this.settingsService.getBackupConfig();
  }

  @Put('backup')
  updateBackupConfig(
    @Body()
    dto: {
      enabled: boolean;
      interval: string;
      time: string;
      keepCount: number;
    },
  ) {
    return this.settingsService.updateBackupConfig(dto);
  }

  @Post('backup/create')
  createBackup() {
    return this.settingsService.createBackup();
  }

  @Get('backup/list')
  listBackups() {
    return this.settingsService.listBackups();
  }

  @Delete('backup/:id')
  deleteBackup(@Param('id') id: string) {
    return this.settingsService.deleteBackup(id);
  }

  @Post('backup/:id/restore')
  restoreBackup(
    @Param('id') id: string,
    @Body() body: { database: boolean; documents: boolean; settings: boolean },
  ) {
    return this.settingsService.restoreBackup(id, body);
  }

  // ── Google Calendar ────────────────────────────────
  @Get('google-calendar')
  getGoogleCalendarConfig() {
    return this.settingsService.getGoogleCalendarConfig();
  }

  @Put('google-calendar')
  updateGoogleCalendarConfig(
    @Body()
    dto: {
      clientId: string;
      clientSecret: string;
      calendarId: string;
      enabled: boolean;
    },
  ) {
    return this.settingsService.updateGoogleCalendarConfig(dto);
  }

  @Get('google-calendar/status')
  getGoogleCalendarSyncStatus() {
    return this.settingsService.getGoogleCalendarSyncStatus();
  }

  @Post('google-calendar/sync')
  syncGoogleCalendar() {
    return this.settingsService.syncToGoogleCalendar();
  }
}
