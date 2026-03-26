import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DeviceBindingMode = 'off' | 'warn' | 'enforce';
export type DeviceBindingAppliesTo = 'login' | 'time' | 'both';

const SETTING_KEY_MODE = 'kiosk.deviceBindingMode';
const SETTING_KEY_APPLIES_TO = 'kiosk.deviceBindingAppliesTo';

export type DeviceCheckResult = {
  allowed: boolean;
  warning?: string;
  deviceId?: string;
};

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Settings ──────────────────────────────────────

  async getDeviceBindingConfig(): Promise<{
    mode: DeviceBindingMode;
    appliesTo: DeviceBindingAppliesTo;
  }> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: [SETTING_KEY_MODE, SETTING_KEY_APPLIES_TO] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.valueJson]));

    const rawMode = map.get(SETTING_KEY_MODE);
    const mode: DeviceBindingMode =
      rawMode === 'warn' || rawMode === 'enforce' ? rawMode : 'off';

    const rawAppliesTo = map.get(SETTING_KEY_APPLIES_TO);
    const appliesTo: DeviceBindingAppliesTo =
      rawAppliesTo === 'login' || rawAppliesTo === 'time'
        ? rawAppliesTo
        : 'both';

    return { mode, appliesTo };
  }

  async updateDeviceBindingConfig(data: {
    mode: DeviceBindingMode;
    appliesTo: DeviceBindingAppliesTo;
  }) {
    if (!['off', 'warn', 'enforce'].includes(data.mode)) {
      throw new BadRequestException('Ungueltiger Modus.');
    }
    if (!['login', 'time', 'both'].includes(data.appliesTo)) {
      throw new BadRequestException('Ungueltiger appliesTo-Wert.');
    }

    await Promise.all([
      this.prisma.setting.upsert({
        where: { key: SETTING_KEY_MODE },
        update: { valueJson: data.mode },
        create: { key: SETTING_KEY_MODE, valueJson: data.mode },
      }),
      this.prisma.setting.upsert({
        where: { key: SETTING_KEY_APPLIES_TO },
        update: { valueJson: data.appliesTo },
        create: { key: SETTING_KEY_APPLIES_TO, valueJson: data.appliesTo },
      }),
    ]);

    return this.getDeviceBindingConfig();
  }

  // ── Device CRUD ───────────────────────────────────

  list() {
    return this.prisma.kioskDevice.findMany({
      orderBy: { lastSeenAt: 'desc' },
      include: {
        assignedWorker: {
          select: {
            id: true,
            workerNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedUser: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });
  }

  async update(
    id: string,
    data: {
      displayName?: string;
      active?: boolean;
      notes?: string;
      assignedWorkerId?: string | null;
      assignedUserId?: string | null;
    },
  ) {
    return this.prisma.kioskDevice.update({
      where: { id },
      data: {
        displayName: data.displayName,
        active: data.active,
        notes: data.notes,
        assignedWorkerId: data.assignedWorkerId,
        assignedUserId: data.assignedUserId,
      },
      include: {
        assignedWorker: {
          select: {
            id: true,
            workerNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        assignedUser: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });
  }

  async remove(id: string) {
    return this.prisma.kioskDevice.delete({ where: { id } });
  }

  // ── Device registration / touch ───────────────────

  async touchDevice(info: {
    deviceUuid: string;
    platform?: string;
    browser?: string;
    userAgent?: string;
  }): Promise<{ id: string; active: boolean; displayName: string | null }> {
    const existing = await this.prisma.kioskDevice.findUnique({
      where: { deviceUuid: info.deviceUuid },
    });

    if (existing) {
      const updated = await this.prisma.kioskDevice.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          platform: info.platform ?? existing.platform,
          browser: info.browser ?? existing.browser,
          userAgent: info.userAgent ?? existing.userAgent,
        },
      });
      return {
        id: updated.id,
        active: updated.active,
        displayName: updated.displayName,
      };
    }

    const created = await this.prisma.kioskDevice.create({
      data: {
        deviceUuid: info.deviceUuid,
        platform: info.platform,
        browser: info.browser,
        userAgent: info.userAgent,
        active: false,
      },
    });

    return {
      id: created.id,
      active: created.active,
      displayName: created.displayName,
    };
  }

  // ── Device check logic ────────────────────────────

  async checkDevice(
    context: 'login' | 'time',
    deviceUuid: string | undefined,
    identity?: { workerId?: string; userId?: string },
  ): Promise<DeviceCheckResult> {
    const config = await this.getDeviceBindingConfig();

    if (config.mode === 'off') {
      return { allowed: true };
    }

    // Check if this context is relevant
    if (config.appliesTo !== 'both' && config.appliesTo !== context) {
      return { allowed: true };
    }

    if (!deviceUuid) {
      if (config.mode === 'enforce') {
        throw new ForbiddenException(
          'Geraetekennung fehlt. Bitte den Kiosk-Browser verwenden.',
        );
      }
      return {
        allowed: true,
        warning: 'Keine Geraetekennung uebermittelt.',
      };
    }

    // Touch/register the device
    const device = await this.touchDevice({ deviceUuid });

    if (!device.active) {
      if (config.mode === 'enforce') {
        throw new ForbiddenException(
          'Dieses Geraet ist nicht freigegeben. Bitte einen Administrator kontaktieren.',
        );
      }
      return {
        allowed: true,
        warning:
          'Dieses Geraet ist noch nicht freigegeben. Vorgang wurde nur mit Warnung zugelassen.',
        deviceId: device.id,
      };
    }

    // Device is active/approved — check identity assignment
    if (identity?.workerId || identity?.userId) {
      const full = await this.prisma.kioskDevice.findUnique({
        where: { deviceUuid },
      });

      if (full) {
        // Check worker assignment
        if (
          identity.workerId &&
          full.assignedWorkerId &&
          full.assignedWorkerId !== identity.workerId
        ) {
          if (config.mode === 'enforce') {
            throw new ForbiddenException(
              'Dieses Geraet ist fuer diesen Kiosk-Benutzer nicht freigegeben.',
            );
          }
          return {
            allowed: true,
            warning:
              'Dieses Geraet ist einem anderen Monteur zugeordnet. Vorgang wurde nur mit Warnung zugelassen.',
            deviceId: device.id,
          };
        }

        // Check user assignment
        if (
          identity.userId &&
          full.assignedUserId &&
          full.assignedUserId !== identity.userId
        ) {
          if (config.mode === 'enforce') {
            throw new ForbiddenException(
              'Dieses Geraet ist fuer diesen Kiosk-Benutzer nicht freigegeben.',
            );
          }
          return {
            allowed: true,
            warning:
              'Dieses Geraet ist einem anderen Benutzer zugeordnet. Vorgang wurde nur mit Warnung zugelassen.',
            deviceId: device.id,
          };
        }
      }
    }

    return { allowed: true, deviceId: device.id };
  }
}
