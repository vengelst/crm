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
import { KIOSK_ALLOWED_KEY } from '../decorators/kiosk-allowed.decorator';
import { RoleCode } from '@prisma/client';

type AuthenticatedUser = {
  sub: string;
  email?: string;
  workerId?: string;
  roles: RoleCode[];
  type: 'user' | 'worker' | 'kiosk-user';
  /** Populated by the guard for user/kiosk-user tokens; undefined for worker tokens. */
  permissions?: string[];
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

      // ── Rollenprüfung (gilt fuer alle Token-Typen) ──
      const requiredRoles =
        this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? [];

      if (payload.type === 'user' || payload.type === 'kiosk-user') {
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        });

        if (!user || !user.isActive) {
          throw new UnauthorizedException('Benutzer nicht aktiv.');
        }

        const userRoles = user.roles.map((entry) => entry.role.code);

        if (requiredRoles.length > 0) {
          const hasRole = requiredRoles.some((role) =>
            userRoles.includes(role),
          );

          if (!hasRole) {
            throw new ForbiddenException('Fehlende Berechtigung.');
          }
        }

        // kiosk-user: bei rollengeschuetzten Endpunkten nur explizit
        // freigegebene erlauben
        if (payload.type === 'kiosk-user' && requiredRoles.length > 0) {
          const kioskAllowed =
            this.reflector.getAllAndOverride<boolean>(KIOSK_ALLOWED_KEY, [
              context.getHandler(),
              context.getClass(),
            ]) ?? false;

          if (!kioskAllowed) {
            throw new ForbiddenException(
              'Dieser Endpunkt ist fuer Kiosk-Benutzer nicht freigegeben.',
            );
          }
        }

        // SUPERADMIN bekommt implizit alle Permissions, unabhaengig von der
        // expliziten Zuweisung – konsistent mit der Seed-Logik.
        const permissions = userRoles.includes(RoleCode.SUPERADMIN)
          ? await this.loadAllPermissionCodes()
          : Array.from(
              new Set(
                user.roles.flatMap((entry) =>
                  entry.role.permissions.map((rp) => rp.permission.code),
                ),
              ),
            );

        payload.permissions = permissions;
      } else if (payload.type === 'worker') {
        // Worker: JWT-Rollen gegen @Roles pruefen
        if (requiredRoles.length > 0) {
          const tokenRoles = payload.roles ?? [];
          const hasRole = requiredRoles.some((role) =>
            tokenRoles.includes(role),
          );

          if (!hasRole) {
            throw new ForbiddenException('Fehlende Berechtigung.');
          }
        }

        // Worker-Token tragen keine fein granularen Permissions.
        payload.permissions = [];
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

  private async loadAllPermissionCodes(): Promise<string[]> {
    const rows = await this.prisma.permission.findMany({
      select: { code: true },
    });
    return rows.map((r) => r.code);
  }
}
