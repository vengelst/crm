import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import {
  BypassTokenType,
  PERMISSIONS_BYPASS_KEY,
} from '../decorators/permissions-bypass.decorator';

type RequestWithUser = Request & {
  user?: {
    type: 'user' | 'worker' | 'kiosk-user' | 'emergency-admin';
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
 * Wenn ein Endpoint oder Controller mit `@Permissions(...)` markiert ist,
 * verlangt dieser Guard, dass der authentifizierte Nutzer ALLE genannten
 * Codes haelt. Endpoints ohne `@Permissions`-Metadaten werden nicht
 * beeinflusst.
 *
 * Ausnahmen:
 *  - Notfall-Admin / Wildcard-Token (`permissions=["*"]`): passiert immer.
 *  - Per-Handler-Bypass via `@PermissionsBypassForTokenTypes('worker',
 *    'kiosk-user')`: aufgelistete Token-Typen passieren NUR an dem
 *    markierten Handler. Restliche Token-Typen werden weiterhin streng
 *    geprueft. Diese Ausnahme ist explizit pro Endpoint zu setzen, damit
 *    es keinen versteckten globalen Bypass gibt.
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

    const held = user.permissions ?? [];

    // Notfall-Admin / Wildcard: Token traegt "*" als Sentinel, der jede
    // Permission-Anforderung deckt. Ohne diese Sonderbehandlung wuerde
    // Break-Glass-Admin an permission-gateten Endpoints scheitern.
    if (held.includes('*')) {
      return true;
    }

    // Per-Handler-Bypass fuer bestimmte Token-Typen (z. B. worker, kiosk-
    // user auf gemeinsam genutzten Read-Endpoints). Wirkt nur, wenn am
    // jeweiligen Handler explizit `@PermissionsBypassForTokenTypes(...)`
    // gesetzt wurde — kein globaler Bypass.
    const bypassTokenTypes =
      this.reflector.getAllAndOverride<BypassTokenType[]>(
        PERMISSIONS_BYPASS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    if (
      bypassTokenTypes.length > 0 &&
      (bypassTokenTypes as string[]).includes(user.type)
    ) {
      return true;
    }

    const missing = required.filter((code) => !held.includes(code));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Fehlende Berechtigung: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
