import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleCode } from '@prisma/client';
import { compare } from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { LoginDto } from './dto/login.dto';
import { KioskLoginDto } from './dto/kiosk-login.dto';
import { PinLoginDto } from './dto/pin-login.dto';
import { EmergencyLoginDto } from './dto/emergency-login.dto';

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
  private readonly logger = new Logger(AuthService.name);
  private readonly auditLogger = new Logger('AUTH_AUDIT');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly devicesService: DevicesService,
  ) {}

  /**
   * Sind die ENV-Variablen so gesetzt, dass der Notfall-Login potenziell
   * verfuegbar ist? Genutzt vom Feature-Flag-Endpoint und intern bei jeder
   * Anmelde-Anfrage.
   */
  isEmergencyAdminEnabled(): boolean {
    return process.env.EMERGENCY_ADMIN_ENABLED === 'true';
  }

  /**
   * Notfall-/Break-Glass-Admin.
   *
   * Authentifiziert ausschliesslich gegen Umgebungsvariablen — kein DB-Zugriff,
   * damit der Login auch bei Datenbankausfall funktioniert. Sicherheitsregeln:
   *   - nur aktiv wenn EMERGENCY_ADMIN_ENABLED=true
   *   - Credentials per timing-safe-compare gegen ENV
   *   - optionale IP-Allowlist (EMERGENCY_ADMIN_ALLOWED_IPS, CSV)
   *   - optionaler Shared-Secret-Header (EMERGENCY_ADMIN_REQUIRE_HEADER:
   *     "Header-Name=expected-value")
   *   - kurze TTL (Default 20 Min., konfigurierbar via
   *     EMERGENCY_ADMIN_TTL_MINUTES, Clamp 5..60)
   *
   * Jeder Versuch wird auditiert (Erfolg + Fehlversuch).
   */
  async emergencyLogin(
    dto: EmergencyLoginDto,
    request: {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
  ) {
    const remoteIp = (request.ip ?? '').toString();
    const username = dto.username ?? '';

    if (!this.isEmergencyAdminEnabled()) {
      this.auditLogger.warn(
        `emergency-login DISABLED ip=${remoteIp} username=${maskUsername(username)}`,
      );
      throw new ForbiddenException('Notfall-Login ist deaktiviert.');
    }

    const expectedUser = process.env.EMERGENCY_ADMIN_USER ?? '';
    const expectedPass = process.env.EMERGENCY_ADMIN_PASS ?? '';
    if (!expectedUser || !expectedPass) {
      this.auditLogger.error(
        `emergency-login MISCONFIGURED ip=${remoteIp} (EMERGENCY_ADMIN_USER/PASS leer trotz EMERGENCY_ADMIN_ENABLED=true)`,
      );
      throw new ForbiddenException(
        'Notfall-Login ist nicht korrekt konfiguriert.',
      );
    }

    // Optionale IP-Allowlist (Komma-separiert).
    const allowedIps = (process.env.EMERGENCY_ADMIN_ALLOWED_IPS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (allowedIps.length > 0 && !allowedIps.includes(remoteIp)) {
      this.auditLogger.warn(
        `emergency-login IP_BLOCKED ip=${remoteIp} username=${maskUsername(username)}`,
      );
      throw new ForbiddenException(
        'Diese IP ist fuer den Notfall-Login nicht freigegeben.',
      );
    }

    // Optionaler Shared-Secret-Header in der Form "X-Header-Name=secret-value".
    const requiredHeader = process.env.EMERGENCY_ADMIN_REQUIRE_HEADER ?? '';
    if (requiredHeader) {
      const sepIndex = requiredHeader.indexOf('=');
      if (sepIndex > 0) {
        const headerName = requiredHeader
          .slice(0, sepIndex)
          .trim()
          .toLowerCase();
        const expectedValue = requiredHeader.slice(sepIndex + 1).trim();
        const headers = request.headers ?? {};
        const rawValue = headers[headerName];
        const provided = Array.isArray(rawValue)
          ? (rawValue[0] ?? '')
          : (rawValue ?? '').toString();
        if (!constantTimeStringEqual(provided, expectedValue)) {
          this.auditLogger.warn(
            `emergency-login HEADER_MISMATCH ip=${remoteIp} username=${maskUsername(username)}`,
          );
          throw new ForbiddenException(
            'Notfall-Login: Sicherheitsheader fehlt oder ungueltig.',
          );
        }
      }
    }

    const userOk = constantTimeStringEqual(dto.username, expectedUser);
    const passOk = constantTimeStringEqual(dto.password, expectedPass);

    if (!userOk || !passOk) {
      this.auditLogger.warn(
        `emergency-login FAIL ip=${remoteIp} username=${maskUsername(username)}`,
      );
      throw new UnauthorizedException('Ungueltige Notfall-Zugangsdaten.');
    }

    const ttlMinutes = parseEmergencyTtlMinutes(
      process.env.EMERGENCY_ADMIN_TTL_MINUTES,
    );
    const sub = `emergency:${expectedUser}`;
    const accessToken = await this.jwtService.signAsync(
      {
        sub,
        email: `${expectedUser}@emergency.local`,
        roles: [RoleCode.SUPERADMIN],
        permissions: ['*'],
        type: 'emergency-admin',
        emergency: true,
      },
      { expiresIn: `${ttlMinutes}m` },
    );

    this.auditLogger.warn(
      `emergency-login SUCCESS ip=${remoteIp} username=${maskUsername(username)} ttl=${ttlMinutes}min`,
    );

    return {
      accessToken,
      ttlMinutes,
      user: {
        id: sub,
        email: `${expectedUser}@emergency.local`,
        displayName: 'Notfall-Admin',
        roles: [RoleCode.SUPERADMIN],
        permissions: ['*'],
      },
      emergency: true,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
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
    const permissions = await this.collectPermissions(user.roles, roles);
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
        permissions,
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
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
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
    const permissions = await this.collectPermissions(kioskUser.roles, roles);

    // Backend-Rollen (SUPERADMIN, OFFICE) → normaler Backend-Login
    const isBackendUser =
      roles.includes(RoleCode.SUPERADMIN) || roles.includes(RoleCode.OFFICE);

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
      loginType: loginType,
      user: {
        id: kioskUser.id,
        email: kioskUser.email,
        displayName: kioskUser.displayName,
        roles,
        permissions,
      },
      worker: null,
      currentProjects: [] as ReturnType<typeof Array<never>>,
      futureProjects: [] as ReturnType<typeof Array<never>>,
      pastProjects: [] as ReturnType<typeof Array<never>>,
      deviceWarning: deviceCheck.warning ?? null,
    };
  }

  /**
   * Compute the permission code list for a user. SUPERADMIN gets every
   * permission in the system implicitly; other roles get exactly what is
   * assigned via RolePermission.
   */
  private async collectPermissions(
    userRoles: Array<{
      role: {
        code: RoleCode;
        permissions: Array<{ permission: { code: string } }>;
      };
    }>,
    roleCodes: RoleCode[],
  ): Promise<string[]> {
    if (roleCodes.includes(RoleCode.SUPERADMIN)) {
      const all = await this.prisma.permission.findMany({
        select: { code: true },
      });
      return all.map((p) => p.code);
    }
    return Array.from(
      new Set(
        userRoles.flatMap((entry) =>
          entry.role.permissions.map((rp) => rp.permission.code),
        ),
      ),
    );
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
        languageCode: worker.languageCode ?? 'de',
        photoPath: worker.photoPath ?? null,
      },
      user: null,
      currentProjects,
      futureProjects,
      pastProjects,
    };
  }
}

/**
 * Konstantzeit-Vergleich zweier Strings — schuetzt vor Timing-Angriffen auf
 * Username/Passwort. Unterschiedliche Laengen werden zuerst auf gleiche Laenge
 * normalisiert und dann verglichen, sodass der Code immer denselben Pfad nimmt.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a ?? '', 'utf8');
  const bBuf = Buffer.from(b ?? '', 'utf8');
  // timingSafeEqual erwartet identische Laengen; mit Padding gleichziehen und
  // anschliessend zusaetzlich auf Original-Laenge pruefen.
  const maxLen = Math.max(aBuf.length, bBuf.length, 1);
  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);
  const equal = timingSafeEqual(aPadded, bPadded);
  return equal && aBuf.length === bBuf.length;
}

/** Auf Hauptbestandteil des Usernames kuerzen, ohne Volltext im Audit-Log. */
function maskUsername(value: string): string {
  if (!value) return '';
  if (value.length <= 2) return '**';
  return `${value.slice(0, 2)}***(${value.length})`;
}

/** TTL-Begrenzung: Default 20 Min., erlaubt 5..60 Min. */
function parseEmergencyTtlMinutes(raw?: string): number {
  const fallback = 20;
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(60, Math.max(5, n));
}
