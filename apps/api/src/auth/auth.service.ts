import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleCode } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { LoginDto } from './dto/login.dto';
import { KioskLoginDto } from './dto/kiosk-login.dto';
import { PinLoginDto } from './dto/pin-login.dto';

const workerAuthInclude = {
  assignments: {
    where: {
      active: true,
    },
    include: {
      project: {
        include: {
          customer: true,
        },
      },
    },
  },
  pins: {
    where: {
      isActive: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
  },
} satisfies Prisma.WorkerInclude;

type WorkerAuthData = Prisma.WorkerGetPayload<{
  include: typeof workerAuthInclude;
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly devicesService: DevicesService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Ungueltige Zugangsdaten.');
    }

    const isValid = await compare(dto.password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('Ungueltige Zugangsdaten.');
    }

    const roles = user.roles.map((entry) => entry.role.code);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      roles,
      type: 'user',
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles,
      },
    };
  }

  async pinLogin(dto: PinLoginDto) {
    const worker = await this.prisma.worker.findUnique({
      where: { workerNumber: dto.workerNumber },
      include: workerAuthInclude,
    });

    if (!worker || !worker.active || worker.pins.length === 0) {
      throw new UnauthorizedException('PIN-Anmeldung fehlgeschlagen.');
    }

    const [pinRecord] = worker.pins;
    const pinMatches = await compare(dto.pin, pinRecord.pinHash);

    if (!pinMatches) {
      throw new UnauthorizedException('PIN-Anmeldung fehlgeschlagen.');
    }

    return this.createWorkerLoginResponse(worker);
  }

  async kioskLogin(dto: KioskLoginDto) {
    // 1. Worker-PINs pruefen
    const workers = await this.prisma.worker.findMany({
      where: {
        active: true,
      },
      include: workerAuthInclude,
    });

    const workerMatches: WorkerAuthData[] = [];

    for (const worker of workers) {
      const [pinRecord] = worker.pins;
      if (!pinRecord) {
        continue;
      }

      const pinMatches = await compare(dto.pin, pinRecord.pinHash);
      if (pinMatches) {
        workerMatches.push(worker);
      }
    }

    // 2. User-KioskCodes pruefen (alle Benutzer mit kioskCodeHash)
    const kioskUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        kioskCodeHash: { not: null },
      },
      include: {
        roles: { include: { role: true } },
      },
    });

    type KioskUserMatch = (typeof kioskUsers)[number];
    const userMatches: KioskUserMatch[] = [];

    for (const user of kioskUsers) {
      if (!user.kioskCodeHash) continue;
      const codeMatches = await compare(dto.pin, user.kioskCodeHash);
      if (codeMatches) {
        userMatches.push(user);
      }
    }

    const totalMatches = workerMatches.length + userMatches.length;

    if (totalMatches === 0) {
      throw new UnauthorizedException('PIN-Anmeldung fehlgeschlagen.');
    }

    if (totalMatches > 1) {
      throw new BadRequestException(
        'PIN/Code ist nicht eindeutig. Bitte eindeutige PINs/Codes zuweisen.',
      );
    }

    // Device touch
    if (dto.deviceUuid) {
      await this.devicesService.touchDevice({
        deviceUuid: dto.deviceUuid,
        platform: dto.platform,
        browser: dto.browser,
        userAgent: dto.userAgent,
      });
    }

    // 3a. Worker-Match → bestehende Logik
    if (workerMatches.length === 1) {
      const worker = workerMatches[0];
      const deviceCheck = await this.devicesService.checkDevice(
        'login',
        dto.deviceUuid,
        { workerId: worker.id },
      );

      const response = await this.createWorkerLoginResponse(worker);
      return {
        ...response,
        deviceWarning: deviceCheck.warning ?? null,
      };
    }

    // 3b. User-Match
    const kioskUser = userMatches[0];
    const deviceCheck = await this.devicesService.checkDevice(
      'login',
      dto.deviceUuid,
      { userId: kioskUser.id },
    );

    const roles = kioskUser.roles.map((entry) => entry.role.code);

    // Backend-Rollen (SUPERADMIN, OFFICE) → normaler Backend-Login
    const isBackendUser = roles.includes(RoleCode.SUPERADMIN) ||
      roles.includes(RoleCode.OFFICE);

    const tokenType = isBackendUser ? 'user' : 'kiosk-user';
    const loginType = isBackendUser ? 'user' : 'kiosk-user';

    const accessToken = await this.jwtService.signAsync({
      sub: kioskUser.id,
      email: kioskUser.email,
      roles,
      type: tokenType,
    });

    return {
      accessToken,
      loginType: loginType as 'user' | 'kiosk-user',
      user: {
        id: kioskUser.id,
        email: kioskUser.email,
        displayName: kioskUser.displayName,
        roles,
      },
      worker: null,
      currentProjects: [] as ReturnType<typeof Array<never>>,
      futureProjects: [] as ReturnType<typeof Array<never>>,
      pastProjects: [] as ReturnType<typeof Array<never>>,
      deviceWarning: deviceCheck.warning ?? null,
    };
  }

  private async createWorkerLoginResponse(worker: WorkerAuthData) {
    if (!worker.active || worker.pins.length === 0) {
      throw new UnauthorizedException('PIN-Anmeldung fehlgeschlagen.');
    }

    // Nur Zuordnungen beruecksichtigen, die aktuell laufen oder in der Zukunft liegen
    const now = new Date();

    if (worker.assignments.length === 0) {
      throw new UnauthorizedException(
        'Keine Projektzuordnung vorhanden. Login nicht moeglich.',
      );
    }

    const mapProject = (a: (typeof worker.assignments)[number]) => ({
      id: a.project.id,
      projectNumber: a.project.projectNumber,
      title: a.project.title,
      status: a.project.status,
      startDate: a.startDate.toISOString(),
      endDate: a.endDate?.toISOString() ?? null,
      siteLatitude: a.project.siteLatitude ?? null,
      siteLongitude: a.project.siteLongitude ?? null,
      customerName: a.project.customer?.companyName ?? null,
    });

    const currentProjects = worker.assignments
      .filter((a) => a.startDate <= now && (!a.endDate || a.endDate >= now))
      .map(mapProject);

    const futureProjects = worker.assignments
      .filter((a) => a.startDate > now)
      .map(mapProject);

    const pastProjects = worker.assignments
      .filter((a) => a.endDate != null && a.endDate < now)
      .map(mapProject);

    const accessToken = await this.jwtService.signAsync({
      sub: worker.id,
      workerId: worker.id,
      roles: [RoleCode.WORKER],
      type: 'worker',
    });

    return {
      accessToken,
      loginType: 'worker' as const,
      worker: {
        id: worker.id,
        workerNumber: worker.workerNumber,
        name: `${worker.firstName} ${worker.lastName}`,
      },
      user: null,
      currentProjects,
      futureProjects,
      pastProjects,
    };
  }
}
