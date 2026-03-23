import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RoleCode } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';

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
      include: {
        assignments: {
          where: {
            active: true,
          },
          include: {
            project: true,
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
      },
    });

    if (!worker || !worker.active || worker.pins.length === 0) {
      throw new UnauthorizedException('PIN-Anmeldung fehlgeschlagen.');
    }

    const [pinRecord] = worker.pins;
    const pinMatches = await compare(dto.pin, pinRecord.pinHash);

    if (!pinMatches) {
      throw new UnauthorizedException('PIN-Anmeldung fehlgeschlagen.');
    }

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
      projects: worker.assignments.map((assignment) => ({
        id: assignment.project.id,
        projectNumber: assignment.project.projectNumber,
        title: assignment.project.title,
        status: assignment.project.status,
      })),
    };
  }
}
