import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export type AppSettings = {
  passwordMinLength: number;
  kioskCodeLength: number;
  defaultTheme: 'light' | 'dark';
};

const DEFAULT_SETTINGS: AppSettings = {
  passwordMinLength: 8,
  kioskCodeLength: 6,
  defaultTheme: 'dark',
};

const SETTING_KEYS = {
  passwordMinLength: 'security.passwordMinLength',
  kioskCodeLength: 'security.kioskCodeLength',
  defaultTheme: 'appearance.defaultTheme',
} as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<AppSettings> {
    const rows = await this.prisma.setting.findMany({
      where: {
        key: {
          in: Object.values(SETTING_KEYS),
        },
      },
    });

    const valueByKey = new Map(rows.map((row) => [row.key, row.valueJson]));

    return {
      passwordMinLength: this.readNumber(
        valueByKey.get(SETTING_KEYS.passwordMinLength),
        DEFAULT_SETTINGS.passwordMinLength,
      ),
      kioskCodeLength: this.readNumber(
        valueByKey.get(SETTING_KEYS.kioskCodeLength),
        DEFAULT_SETTINGS.kioskCodeLength,
      ),
      defaultTheme: this.readTheme(
        valueByKey.get(SETTING_KEYS.defaultTheme),
        DEFAULT_SETTINGS.defaultTheme,
      ),
    };
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<AppSettings> {
    await Promise.all([
      this.prisma.setting.upsert({
        where: { key: SETTING_KEYS.passwordMinLength },
        update: { valueJson: dto.passwordMinLength },
        create: {
          key: SETTING_KEYS.passwordMinLength,
          valueJson: dto.passwordMinLength,
        },
      }),
      this.prisma.setting.upsert({
        where: { key: SETTING_KEYS.kioskCodeLength },
        update: { valueJson: dto.kioskCodeLength },
        create: {
          key: SETTING_KEYS.kioskCodeLength,
          valueJson: dto.kioskCodeLength,
        },
      }),
      this.prisma.setting.upsert({
        where: { key: SETTING_KEYS.defaultTheme },
        update: { valueJson: dto.defaultTheme },
        create: {
          key: SETTING_KEYS.defaultTheme,
          valueJson: dto.defaultTheme,
        },
      }),
    ]);

    return this.getSettings();
  }

  private readNumber(value: unknown, fallback: number) {
    return typeof value === 'number' ? value : fallback;
  }

  private readTheme(value: unknown, fallback: AppSettings['defaultTheme']) {
    return value === 'light' || value === 'dark' ? value : fallback;
  }

  async getSmtpConfig() {
    const config = await this.prisma.smtpConfig.findFirst();
    if (!config) {
      return {
        host: '',
        port: 587,
        user: '',
        password: '',
        fromEmail: '',
        secure: false,
      };
    }
    return {
      host: config.host,
      port: config.port,
      user: config.user ?? '',
      password: config.password ?? '',
      fromEmail: config.fromEmail,
      secure: config.secure,
    };
  }

  async updateSmtpConfig(data: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    fromEmail: string;
    secure: boolean;
  }) {
    const existing = await this.prisma.smtpConfig.findFirst();
    if (existing) {
      return this.prisma.smtpConfig.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.smtpConfig.create({ data });
  }

  async getPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async getRolePermissions(roleId: string) {
    const rps = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rps.map((rp) => rp.permission);
  }

  async setRolePermissions(roleId: string, permissionIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
    });
    return this.getRolePermissions(roleId);
  }

  async getBackupConfig() {
    const keys = [
      'backup.enabled',
      'backup.interval',
      'backup.time',
      'backup.keepCount',
    ];
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
    return {
      enabled: byKey.get('backup.enabled') === true,
      interval: (byKey.get('backup.interval') as string) ?? 'daily',
      time: (byKey.get('backup.time') as string) ?? '02:00',
      keepCount: this.readNumber(byKey.get('backup.keepCount'), 7),
    };
  }

  async updateBackupConfig(data: {
    enabled: boolean;
    interval: string;
    time: string;
    keepCount: number;
  }) {
    const entries: [string, string | number | boolean][] = [
      ['backup.enabled', data.enabled],
      ['backup.interval', data.interval],
      ['backup.time', data.time],
      ['backup.keepCount', data.keepCount],
    ];

    for (const [key, valueJson] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson },
        create: { key, valueJson },
      });
    }

    return this.getBackupConfig();
  }
}
