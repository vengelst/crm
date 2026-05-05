import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_BYPASS_KEY = 'permissionsBypassTokenTypes';

export type BypassTokenType = 'worker' | 'kiosk-user';

/**
 * Erlaubt definierten Token-Typen, einen `@Permissions(...)`-gateten
 * Endpoint zu passieren — bewusst pro Handler, nicht global.
 *
 * Hintergrund: Worker- und Kiosk-Tokens tragen keine fein-granularen
 * Permission-Codes. Auf Endpoints, die fachlich beide Welten bedienen
 * (z. B. `GET /projects` mit serverseitig getrennten Service-Pfaden fuer
 * Office, Worker und Kiosk), ist es korrekt, die Permission-Pruefung fuer
 * genau diese Token-Typen zu ueberspringen — der RolesGuard und die
 * `@KioskAllowed`-Decorator + die handler-internen Filter (z. B.
 * `listForWorker`, `getByIdForManager`) tragen die Sicherheit dort.
 *
 * Office/PM/Admin-Tokens werden weiterhin streng auf Permissions geprueft.
 *
 * Beispiel:
 * ```
 * @Get(':id')
 * @Roles(SUPERADMIN, OFFICE, PROJECT_MANAGER, WORKER)
 * @KioskAllowed()
 * @Permissions('projects.view')
 * @PermissionsBypassForTokenTypes('worker', 'kiosk-user')
 * getById(...) { ... }
 * ```
 */
export const PermissionsBypassForTokenTypes = (
  ...tokenTypes: BypassTokenType[]
) => SetMetadata(PERMISSIONS_BYPASS_KEY, tokenTypes);
