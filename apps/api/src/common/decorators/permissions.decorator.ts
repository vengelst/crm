import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Mark an endpoint or controller as requiring one or more permission codes.
 * Codes correspond to entries in the Permission table (see seed.ts).
 *
 * Combined behaviour with @Roles:
 * - @Roles still gates which role types may reach the endpoint at all.
 * - @Permissions then requires the authenticated user to additionally hold
 *   ALL of the listed permission codes (loaded from DB on each request).
 *
 * Worker-type tokens currently do not carry permission codes; endpoints that
 * use @Permissions are therefore implicitly closed to worker logins.
 */
export const Permissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
