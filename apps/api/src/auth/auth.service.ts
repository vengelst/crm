import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleCode } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
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
    const workers = await this.prisma.worker.findMany({
      where: {
        active: true,
      },
      include: workerAuthInclude,
    });

    const matches: WorkerAuthData[] = [];

    for (const worker of workers) {
      const [pinRecord] = worker.pins;
      if (!pinRecord) {
        continue;
      }

      const pinMatches = await compare(dto.pin, pinRecord.pinHash);
      if (pinMatches) {
        matches.push(worker);
      }
    }

    if (matches.length === 0) {
      throw new UnauthorizedException('PIN-Anmeldung fehlgeschlagen.');
    }

    if (matches.length > 1) {
      throw new BadRequestException(
        'PIN ist nicht eindeutig. Bitte einem aktiven Monteur eine eindeutige PIN zuweisen.',
      );
    }

    return this.createWorkerLoginResponse(matches[0]);
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
      worker: {
        id: worker.id,
        workerNumber: worker.workerNumber,
        name: `${worker.firstName} ${worker.lastName}`,
      },
      currentProjects,
      futureProjects,
      pastProjects,
    };
  }
}
