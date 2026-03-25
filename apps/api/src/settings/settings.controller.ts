import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
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
}
