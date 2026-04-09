import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SaveUserDto } from './dto/save-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }],
    });
  }

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async create(dto: SaveUserDto) {
    if (!dto.password) {
      throw new BadRequestException('Passwort ist beim Anlegen Pflicht.');
    }

    if (!dto.kioskCode) {
      throw new BadRequestException('Kiosk-Code ist beim Anlegen Pflicht.');
    }

    await this.validateSecrets(dto.password, dto.kioskCode);
    await this.ensureKioskCodeGloballyUnique(dto.kioskCode);

    const passwordHash = await hash(dto.password, 10);
    const kioskCodeHash = await hash(dto.kioskCode, 10);
    const roles = await this.resolveRoles(dto.roleCodes);

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        displayName: dto.displayName,
        notes: dto.notes,
        passwordHash,
        kioskCodeHash,
        isActive: dto.isActive ?? true,
        roles: {
          create: roles.map((role) => ({
            roleId: role.id,
          })),
        },
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  async update(id: string, dto: SaveUserDto) {
    await this.ensureExists(id);

    if (dto.password || dto.kioskCode) {
      await this.validateSecrets(dto.password, dto.kioskCode);
    }

    if (dto.kioskCode) {
      await this.ensureKioskCodeGloballyUnique(dto.kioskCode, id);
    }

    const roles = await this.resolveRoles(dto.roleCodes);

    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: {
          userId: id,
        },
      });

      const user = await tx.user.update({
        where: { id },
        data: {
          email: dto.email.toLowerCase(),
          displayName: dto.displayName,
          notes: dto.notes,
          isActive: dto.isActive ?? true,
          passwordHash: dto.password ? await hash(dto.password, 10) : undefined,
          kioskCodeHash: dto.kioskCode
            ? await hash(dto.kioskCode, 10)
            : undefined,
          roles: {
            create: roles.map((role) => ({
              roleId: role.id,
            })),
          },
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      return user;
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);

    return this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden.');
    }

    return user;
  }

  private async resolveRoles(roleCodes: RoleCode[]) {
    const roles = await this.prisma.role.findMany({
      where: {
        code: {
          in: roleCodes,
        },
      },
    });

    if (roles.length !== roleCodes.length) {
      throw new BadRequestException('Mindestens eine Rolle ist ungueltig.');
    }

    return roles;
  }

  private async validateSecrets(password?: string, kioskCode?: string) {
    const settings = await this.settingsService.getSettings();

    if (password && password.length < settings.passwordMinLength) {
      throw new BadRequestException(
        `Passwort muss mindestens ${settings.passwordMinLength} Zeichen lang sein.`,
      );
    }

    if (kioskCode && kioskCode.length !== settings.kioskCodeLength) {
      throw new BadRequestException(
        `Kiosk-Code muss genau ${settings.kioskCodeLength} Zeichen lang sein.`,
      );
    }
  }

  /**
   * Kiosk-Login: PIN darf nicht mehrdeutig sein — keine Kollision mit Monteur-PINs
   * oder anderen Benutzer-Kiosk-Codes.
   */
  private async ensureKioskCodeGloballyUnique(
    code: string,
    excludeUserId?: string,
  ) {
    const workers = await this.prisma.worker.findMany({
      where: { active: true },
      include: {
        pins: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    for (const worker of workers) {
      const [activePin] = worker.pins;
      if (!activePin) {
        continue;
      }
      if (await compare(code, activePin.pinHash)) {
        throw new BadRequestException(
          'Kiosk-Code kollidiert mit einem Monteur-PIN. Bitte anderen Code waehlen.',
        );
      }
    }

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        kioskCodeHash: { not: null },
        ...(excludeUserId
          ? {
              NOT: { id: excludeUserId },
            }
          : {}),
      },
      select: { kioskCodeHash: true },
    });

    for (const user of users) {
      if (!user.kioskCodeHash) {
        continue;
      }
      if (await compare(code, user.kioskCodeHash)) {
        throw new BadRequestException(
          'Kiosk-Code bereits von einem anderen Benutzer vergeben.',
        );
      }
    }
  }
}
