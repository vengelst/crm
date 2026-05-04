import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

type RequestWithUser = Request & {
  user?: {
    type: 'user' | 'worker' | 'kiosk-user';
    permissions?: string[];
  };
};

/**
 * Permission enforcement guard.
 *
 * Runs AFTER JwtAuthGuard, which is responsible for loading
 * `request.user.permissions` from the database (single source of truth –
 * never trust the JWT payload for fine-grained authz).
 *
 * If the endpoint or controller is decorated with `@Permissions(...)`, this
 * guard checks the authenticated user holds ALL listed permission codes.
 * Endpoints without `@Permissions` metadata are unaffected.
 *
 * Worker tokens have no fine-grained permissions, so any worker hitting a
 * permission-protected endpoint is rejected.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // JwtAuthGuard runs first and either rejects unauthenticated requests
    // (Public endpoints aren't reached here because they have no permissions
    // metadata in practice) or attaches `user`. If user is missing, fail safe.
    if (!user) {
      throw new ForbiddenException('Nicht authentifiziert.');
    }

    if (user.type === 'worker') {
      throw new ForbiddenException(
        'Dieser Endpunkt ist fuer Monteure nicht freigegeben.',
      );
    }

    const held = user.permissions ?? [];
    const missing = required.filter((code) => !held.includes(code));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Fehlende Berechtigung: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
