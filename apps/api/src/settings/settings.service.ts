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
}
