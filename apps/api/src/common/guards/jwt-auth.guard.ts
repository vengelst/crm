import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RoleCode } from '@prisma/client';

type AuthenticatedUser = {
  sub: string;
  email?: string;
  workerId?: string;
  roles: RoleCode[];
  type: 'user' | 'worker';
};

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Fehlender Bearer-Token.');
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const payload =
        await this.jwtService.verifyAsync<AuthenticatedUser>(token);
      request.user = payload;

      if (payload.type === 'user') {
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        });

        if (!user || !user.isActive) {
          throw new UnauthorizedException('Benutzer nicht aktiv.');
        }

        const requiredRoles =
          this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
          ]) ?? [];

        if (requiredRoles.length > 0) {
          const userRoles = user.roles.map((entry) => entry.role.code);
          const hasRole = requiredRoles.some((role) =>
            userRoles.includes(role),
          );

          if (!hasRole) {
            throw new ForbiddenException('Fehlende Berechtigung.');
          }
        }
      }

      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new UnauthorizedException('Ungueltiger oder abgelaufener Token.');
    }
  }
}
