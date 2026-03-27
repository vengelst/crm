import { BadRequestException, Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export type AppSettings = {
  passwordMinLength: number;
  kioskCodeLength: number;
  defaultTheme: 'light' | 'dark';
};

const DEFAULT_SETTINGS: AppSettings = {
  passwordMinLength: 8,
  kioskCodeLength: 6,
  defaultTheme: 'dark',
};

const SETTING_KEYS = {
  passwordMinLength: 'security.passwordMinLength',
  kioskCodeLength: 'security.kioskCodeLength',
  defaultTheme: 'appearance.defaultTheme',
} as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<AppSettings> {
    const rows = await this.prisma.setting.findMany({
      where: {
        key: {
          in: Object.values(SETTING_KEYS),
        },
      },
    });

    const valueByKey = new Map(rows.map((row) => [row.key, row.valueJson]));

    return {
      passwordMinLength: this.readNumber(
        valueByKey.get(SETTING_KEYS.passwordMinLength),
        DEFAULT_SETTINGS.passwordMinLength,
      ),
      kioskCodeLength: this.readNumber(
        valueByKey.get(SETTING_KEYS.kioskCodeLength),
        DEFAULT_SETTINGS.kioskCodeLength,
      ),
      defaultTheme: this.readTheme(
        valueByKey.get(SETTING_KEYS.defaultTheme),
        DEFAULT_SETTINGS.defaultTheme,
      ),
    };
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<AppSettings> {
    await Promise.all([
      this.prisma.setting.upsert({
        where: { key: SETTING_KEYS.passwordMinLength },
        update: { valueJson: dto.passwordMinLength },
        create: {
          key: SETTING_KEYS.passwordMinLength,
          valueJson: dto.passwordMinLength,
        },
      }),
      this.prisma.setting.upsert({
        where: { key: SETTING_KEYS.kioskCodeLength },
        update: { valueJson: dto.kioskCodeLength },
        create: {
          key: SETTING_KEYS.kioskCodeLength,
          valueJson: dto.kioskCodeLength,
        },
      }),
      this.prisma.setting.upsert({
        where: { key: SETTING_KEYS.defaultTheme },
        update: { valueJson: dto.defaultTheme },
        create: {
          key: SETTING_KEYS.defaultTheme,
          valueJson: dto.defaultTheme,
        },
      }),
    ]);

    return this.getSettings();
  }

  private readNumber(value: unknown, fallback: number) {
    return typeof value === 'number' ? value : fallback;
  }

  private readTheme(value: unknown, fallback: AppSettings['defaultTheme']) {
    return value === 'light' || value === 'dark' ? value : fallback;
  }

  async getSmtpConfig() {
    const config = await this.prisma.smtpConfig.findFirst();
    if (!config) {
      return {
        host: '',
        port: 587,
        user: '',
        password: '',
        fromEmail: '',
        secure: false,
      };
    }
    return {
      host: config.host,
      port: config.port,
      user: config.user ?? '',
      password: config.password ?? '',
      fromEmail: config.fromEmail,
      secure: config.secure,
    };
  }

  async updateSmtpConfig(data: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    fromEmail: string;
    secure: boolean;
  }) {
    const existing = await this.prisma.smtpConfig.findFirst();
    if (existing) {
      return this.prisma.smtpConfig.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.smtpConfig.create({ data });
  }

  async sendSmtpTest(data: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    fromEmail: string;
    secure: boolean;
    recipient: string;
  }) {
    if (!data.host || !data.port || !data.fromEmail || !data.recipient) {
      throw new BadRequestException(
        'SMTP Host, Port, Absenderadresse und Testempfaenger sind erforderlich.',
      );
    }

    const transport = createTransport({
      host: data.host,
      port: data.port,
      secure: data.secure,
      auth:
        data.user && data.password
          ? { user: data.user, pass: data.password }
          : undefined,
    });

    try {
      await transport.verify();

      const result = await transport.sendMail({
        from: data.fromEmail,
        to: data.recipient,
        subject: 'CRM SMTP-Test',
        text: `Dies ist eine Test-E-Mail der CRM-App.\n\nHost: ${data.host}\nPort: ${data.port}\nSicher: ${data.secure ? 'ja' : 'nein'}`,
      });

      return {
        ok: true,
        recipient: data.recipient,
        messageId: result.messageId,
      };
    } catch (error) {
      throw new BadRequestException(this.formatSmtpError(error));
    }
  }

  private formatSmtpError(error: unknown) {
    if (!(error instanceof Error)) {
      return 'SMTP-Test fehlgeschlagen.';
    }

    const code = (error as { code?: string }).code;

    if (code === 'EAUTH') {
      return 'SMTP-Anmeldung fehlgeschlagen. Benutzername oder Passwort sind ungueltig.';
    }

    if (code === 'ESOCKET' && error.message.includes('wrong version number')) {
      return 'SMTP-Verbindung fehlgeschlagen. Bitte Port und SSL/TLS-Einstellung pruefen (meist Port 587 mit "Sicher" aus oder Port 465 mit "Sicher" an).';
    }

    return `SMTP-Test fehlgeschlagen: ${error.message}`;
  }

  async getPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async getRolePermissions(roleId: string) {
    const rps = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rps.map((rp) => rp.permission);
  }

  async setRolePermissions(roleId: string, permissionIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
    });
    return this.getRolePermissions(roleId);
  }

  async getCompanyInfo() {
    const prefix = 'company.';
    const rows = await this.prisma.setting.findMany({
      where: { key: { startsWith: prefix } },
    });
    const byKey = new Map(
      rows.map((r) => [r.key.slice(prefix.length), r.valueJson]),
    );
    return {
      name: (byKey.get('name') as string) ?? '',
      street: (byKey.get('street') as string) ?? '',
      postalCode: (byKey.get('postalCode') as string) ?? '',
      city: (byKey.get('city') as string) ?? '',
      country: (byKey.get('country') as string) ?? '',
      phone: (byKey.get('phone') as string) ?? '',
      email: (byKey.get('email') as string) ?? '',
      website: (byKey.get('website') as string) ?? '',
    };
  }

  async updateCompanyInfo(data: Record<string, string>) {
    for (const [field, value] of Object.entries(data)) {
      const key = `company.${field}`;
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson: value },
        create: { key, valueJson: value },
      });
    }
    return this.getCompanyInfo();
  }

  async getPdfConfig() {
    const prefix = 'pdf.';
    const rows = await this.prisma.setting.findMany({
      where: { key: { startsWith: prefix } },
    });
    const byKey = new Map(
      rows.map((r) => [r.key.slice(prefix.length), r.valueJson]),
    );
    return {
      header: (byKey.get('header') as string) ?? '',
      footer: (byKey.get('footer') as string) ?? '',
      extraText: (byKey.get('extraText') as string) ?? '',
      useLogo: byKey.get('useLogo') === true,
    };
  }

  async updatePdfConfig(data: {
    header: string;
    footer: string;
    extraText: string;
    useLogo: boolean;
  }) {
    const entries: [string, string | boolean][] = [
      ['pdf.header', data.header],
      ['pdf.footer', data.footer],
      ['pdf.extraText', data.extraText],
      ['pdf.useLogo', data.useLogo],
    ];
    for (const [key, valueJson] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson },
        create: { key, valueJson },
      });
    }
    return this.getPdfConfig();
  }

  async getBackupConfig() {
    const keys = [
      'backup.enabled',
      'backup.interval',
      'backup.time',
      'backup.keepCount',
    ];
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
    return {
      enabled: byKey.get('backup.enabled') === true,
      interval: (byKey.get('backup.interval') as string) ?? 'daily',
      time: (byKey.get('backup.time') as string) ?? '02:00',
      keepCount: this.readNumber(byKey.get('backup.keepCount'), 7),
    };
  }

  async updateBackupConfig(data: {
    enabled: boolean;
    interval: string;
    time: string;
    keepCount: number;
  }) {
    const entries: [string, string | number | boolean][] = [
      ['backup.enabled', data.enabled],
      ['backup.interval', data.interval],
      ['backup.time', data.time],
      ['backup.keepCount', data.keepCount],
    ];

    for (const [key, valueJson] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson },
        create: { key, valueJson },
      });
    }

    return this.getBackupConfig();
  }

  // ── Logo ────────────────────────────────────────────
  async setLogo(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }
    const logoPath = join('logo', file.filename);
    await this.prisma.setting.upsert({
      where: { key: 'company.logoPath' },
      update: { valueJson: logoPath },
      create: { key: 'company.logoPath', valueJson: logoPath },
    });
    return { path: logoPath, filename: file.originalname };
  }

  async getLogo() {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'company.logoPath' },
    });
    const path = typeof row?.valueJson === 'string' ? row.valueJson : null;
    return { path };
  }

  async deleteLogo() {
    const logo = await this.getLogo();
    if (logo.path) {
      const abs = resolve(process.cwd(), 'storage', logo.path);
      if (existsSync(abs)) rmSync(abs);
    }
    await this.prisma.setting.deleteMany({
      where: { key: 'company.logoPath' },
    });
    return { deleted: true };
  }

  // ── Backup ──────────────────────────────────────────
  private get backupDir() {
    const dir = resolve(process.cwd(), 'storage', 'backups');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  async createBackup() {
    const id = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = join(this.backupDir, id);
    mkdirSync(backupPath, { recursive: true });

    let databaseStatus = 'skipped';
    let settingsStatus = 'skipped';
    let documentsStatus = 'skipped';

    // 1. Database dump
    const dbUrl =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur';
    try {
      const dumpFile = join(backupPath, 'database.sql');
      execSync(`pg_dump "${dbUrl}" --clean --if-exists > "${dumpFile}"`, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Pruefen ob Dump sinnvollen Inhalt hat (mehr als 100 Bytes)
      const dumpSize = statSync(dumpFile).size;
      if (dumpSize > 100) {
        databaseStatus = 'success';
      } else {
        databaseStatus = 'failed: Dump-Datei ist leer oder zu klein';
        rmSync(dumpFile);
      }
    } catch (e) {
      databaseStatus = `failed: ${e instanceof Error ? e.message : 'pg_dump nicht verfuegbar'}`;
    }

    // 2. Settings export
    try {
      const settings = await this.prisma.setting.findMany();
      writeFileSync(
        join(backupPath, 'settings.json'),
        JSON.stringify(settings, null, 2),
      );
      settingsStatus = 'success';
    } catch (e) {
      settingsStatus = `failed: ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`;
    }

    // 3. Documents (copy uploads)
    const uploadsDir = resolve(process.cwd(), 'storage', 'uploads');
    const docsBackupDir = join(backupPath, 'uploads');
    try {
      if (existsSync(uploadsDir)) {
        const files = readdirSync(uploadsDir);
        if (files.length > 0) {
          mkdirSync(docsBackupDir, { recursive: true });
          for (const file of files) {
            copyFileSync(join(uploadsDir, file), join(docsBackupDir, file));
          }
          documentsStatus = `success: ${files.length} Dateien`;
        } else {
          documentsStatus = 'success: keine Dateien vorhanden';
        }
      } else {
        documentsStatus = 'success: Upload-Verzeichnis nicht vorhanden';
      }
    } catch (e) {
      documentsStatus = `failed: ${e instanceof Error ? e.message : 'Kopierfehler'}`;
    }

    // 4. Manifest
    const manifest = {
      id,
      createdAt: new Date().toISOString(),
      hasDatabase: databaseStatus.startsWith('success'),
      databaseStatus,
      hasSettings: settingsStatus.startsWith('success'),
      settingsStatus,
      hasDocuments: documentsStatus.startsWith('success'),
      documentsStatus,
    };
    writeFileSync(
      join(backupPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );

    // Cleanup: keepCount
    await this.enforceKeepCount();

    return manifest;
  }

  listBackups() {
    const dir = this.backupDir;
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const manifestPath = join(dir, e.name, 'manifest.json');
        if (!existsSync(manifestPath)) return null;
        try {
          const manifest = JSON.parse(
            readFileSync(manifestPath, 'utf-8'),
          ) as Record<string, unknown>;
          const stat = statSync(join(dir, e.name));
          // Calculate size
          let size = 0;
          const walkDir = (d: string) => {
            for (const f of readdirSync(d, { withFileTypes: true })) {
              const p = join(d, f.name);
              if (f.isDirectory()) walkDir(p);
              else size += statSync(p).size;
            }
          };
          walkDir(join(dir, e.name));
          return {
            id: e.name,
            createdAt: manifest.createdAt ?? stat.mtime.toISOString(),
            hasDatabase: manifest.hasDatabase ?? false,
            databaseStatus:
              typeof manifest.databaseStatus === 'string'
                ? manifest.databaseStatus
                : manifest.hasDatabase
                  ? 'success'
                  : 'unknown',
            hasSettings: manifest.hasSettings ?? false,
            settingsStatus:
              typeof manifest.settingsStatus === 'string'
                ? manifest.settingsStatus
                : manifest.hasSettings
                  ? 'success'
                  : 'unknown',
            hasDocuments: manifest.hasDocuments ?? false,
            documentsStatus:
              typeof manifest.documentsStatus === 'string'
                ? manifest.documentsStatus
                : manifest.hasDocuments
                  ? 'success'
                  : 'unknown',
            sizeBytes: size,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ae = a as { createdAt?: string } | null;
        const be = b as { createdAt?: string } | null;
        return (
          new Date(be?.createdAt ?? '').getTime() -
          new Date(ae?.createdAt ?? '').getTime()
        );
      });

    return entries;
  }

  private validateBackupId(id: string): string {
    // Strenge ID-Validierung: nur alphanumerisch, Bindestrich, Unterstrich, Punkt
    if (!/^[\w.-]+$/.test(id)) {
      throw new BadRequestException(
        'Ungueltige Backup-ID. Nur alphanumerische Zeichen, Bindestrich, Unterstrich und Punkt erlaubt.',
      );
    }

    const backupPath = resolve(this.backupDir, id);

    // Pfad-Traversal-Schutz: resolved path muss im Backup-Verzeichnis liegen
    const normalizedBase = resolve(this.backupDir);
    if (!backupPath.startsWith(normalizedBase + '/') && !backupPath.startsWith(normalizedBase + '\\')) {
      throw new BadRequestException('Ungueltige Backup-ID.');
    }

    if (!existsSync(backupPath)) {
      throw new BadRequestException('Backup nicht gefunden.');
    }

    return backupPath;
  }

  deleteBackup(id: string) {
    const backupPath = this.validateBackupId(id);
    rmSync(backupPath, { recursive: true, force: true });
    return { deleted: true };
  }

  async restoreBackup(
    id: string,
    options: { database: boolean; documents: boolean; settings: boolean },
  ) {
    const backupPath = this.validateBackupId(id);

    const results: string[] = [];

    // 1. Settings — echter Restore: bestehende loeschen, dann aus Backup importieren
    if (options.settings) {
      const settingsFile = join(backupPath, 'settings.json');
      if (existsSync(settingsFile)) {
        try {
          const settings = JSON.parse(
            readFileSync(settingsFile, 'utf-8'),
          ) as Array<{ key: string; valueJson: unknown }>;
          // Bestehende Settings loeschen
          await this.prisma.setting.deleteMany({});
          // Aus Backup importieren
          for (const s of settings) {
            const val = s.valueJson as string | number | boolean;
            await this.prisma.setting.create({
              data: { key: s.key, valueJson: val },
            });
          }
          results.push(
            `Einstellungen wiederhergestellt (${settings.length} Eintraege).`,
          );
        } catch (e) {
          results.push(
            `Einstellungen-Restore fehlgeschlagen: ${e instanceof Error ? e.message : 'Fehler'}`,
          );
        }
      } else {
        results.push('Einstellungen-Backup nicht vorhanden, uebersprungen.');
      }
    }

    // 2. Documents — echter Restore: bestehende Uploads loeschen, dann aus Backup kopieren
    if (options.documents) {
      const docsBackup = join(backupPath, 'uploads');
      if (existsSync(docsBackup)) {
        try {
          const uploadsDir = resolve(process.cwd(), 'storage', 'uploads');
          // Bestehende Uploads loeschen
          if (existsSync(uploadsDir)) {
            for (const f of readdirSync(uploadsDir)) {
              rmSync(join(uploadsDir, f));
            }
          }
          mkdirSync(uploadsDir, { recursive: true });
          const files = readdirSync(docsBackup);
          for (const file of files) {
            copyFileSync(join(docsBackup, file), join(uploadsDir, file));
          }
          results.push(
            `Dokumente wiederhergestellt (${files.length} Dateien).`,
          );
        } catch (e) {
          results.push(
            `Dokumente-Restore fehlgeschlagen: ${e instanceof Error ? e.message : 'Fehler'}`,
          );
        }
      } else {
        results.push('Dokumente-Backup nicht vorhanden, uebersprungen.');
      }
    }

    // 3. Database
    if (options.database) {
      const dumpFile = join(backupPath, 'database.sql');
      if (existsSync(dumpFile)) {
        const dbUrl =
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur';
        try {
          execSync(`psql "${dbUrl}" < "${dumpFile}"`, {
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          results.push('Datenbank wiederhergestellt.');
        } catch (e) {
          results.push(
            `Datenbank-Restore fehlgeschlagen: ${e instanceof Error ? e.message : 'psql nicht verfuegbar'}`,
          );
        }
      } else {
        results.push('Datenbank-Backup nicht vorhanden, uebersprungen.');
      }
    }

    return { restored: results };
  }

  private async enforceKeepCount() {
    const config = await this.getBackupConfig();
    const backups = this.listBackups();
    if (backups.length > config.keepCount) {
      const toDelete = backups.slice(config.keepCount);
      for (const b of toDelete) {
        const backup = b as { id: string };
        this.deleteBackup(backup.id);
      }
    }
  }

  // ── Google Calendar ─────────────────────────────────
  async getGoogleCalendarConfig() {
    const keys = [
      'gcal.clientId',
      'gcal.clientSecret',
      'gcal.calendarId',
      'gcal.enabled',
    ];
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
    return {
      clientId:
        typeof byKey.get('gcal.clientId') === 'string'
          ? (byKey.get('gcal.clientId') as string)
          : '',
      clientSecret:
        typeof byKey.get('gcal.clientSecret') === 'string'
          ? (byKey.get('gcal.clientSecret') as string)
          : '',
      calendarId:
        typeof byKey.get('gcal.calendarId') === 'string'
          ? (byKey.get('gcal.calendarId') as string)
          : '',
      enabled: byKey.get('gcal.enabled') === true,
    };
  }

  async updateGoogleCalendarConfig(data: {
    clientId: string;
    clientSecret: string;
    calendarId: string;
    enabled: boolean;
  }) {
    const entries: [string, string | boolean][] = [
      ['gcal.clientId', data.clientId],
      ['gcal.clientSecret', data.clientSecret],
      ['gcal.calendarId', data.calendarId],
      ['gcal.enabled', data.enabled],
    ];
    for (const [key, valueJson] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson },
        create: { key, valueJson },
      });
    }
    return this.getGoogleCalendarConfig();
  }

  async getGoogleCalendarSyncStatus() {
    const rows = await this.prisma.setting.findMany({
      where: {
        key: {
          in: ['gcal.lastSync', 'gcal.lastSyncStatus', 'gcal.lastSyncCount'],
        },
      },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
    return {
      lastSync:
        typeof byKey.get('gcal.lastSync') === 'string'
          ? (byKey.get('gcal.lastSync') as string)
          : null,
      lastSyncStatus:
        typeof byKey.get('gcal.lastSyncStatus') === 'string'
          ? (byKey.get('gcal.lastSyncStatus') as string)
          : null,
      lastSyncCount:
        typeof byKey.get('gcal.lastSyncCount') === 'number'
          ? (byKey.get('gcal.lastSyncCount') as number)
          : 0,
    };
  }

  /**
   * Google Calendar Sync MVP.
   *
   * Google Calendar API v3 erfordert einen OAuth2 Access Token.
   * Fuer Server-zu-Server-Sync wird ein Service Account verwendet:
   *   - clientId = Service Account E-Mail
   *   - clientSecret = OAuth2 Access Token (manuell generiert oder per JWT-Flow)
   *   - calendarId = Google Calendar ID
   *
   * Der Access Token muss vorab beschafft werden (z.B. ueber Google Cloud Console
   * OAuth Playground oder ein Service Account JWT-Flow-Script).
   */
  async syncToGoogleCalendar() {
    const config = await this.getGoogleCalendarConfig();
    if (!config.enabled) {
      throw new BadRequestException('Google-Kalender-Sync ist deaktiviert.');
    }
    if (!config.calendarId || !config.clientSecret) {
      throw new BadRequestException(
        'Google-Kalender nicht vollstaendig konfiguriert. Bitte Kalender-ID und Access Token eintragen.',
      );
    }

    const accessToken = config.clientSecret; // OAuth2 Access Token
    const calendarId = encodeURIComponent(config.calendarId);
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, plannedStartDate: { not: null } },
      include: { customer: true },
    });

    let syncCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const p of projects) {
      if (!p.plannedStartDate) continue;

      const startDate = p.plannedStartDate.toISOString().slice(0, 10);
      const endDate = p.plannedEndDate
        ? p.plannedEndDate.toISOString().slice(0, 10)
        : startDate;

      const eventBody = {
        summary: `${p.projectNumber} - ${p.title}`,
        description: `Kunde: ${p.customer?.companyName ?? '-'}\nStatus: ${p.status}`,
        location: [p.siteAddressLine1, p.siteCity].filter(Boolean).join(', '),
        start: { date: startDate },
        end: { date: endDate },
      };

      // Google Event ID: nur lowercase alphanumeric, 5-1024 chars
      const eventId = p.id
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .slice(0, 32);

      try {
        // Versuche Update (PATCH), bei 404 Insert (POST)
        const patchRes = await fetch(`${baseUrl}/${eventId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(eventBody),
        });

        if (patchRes.ok) {
          syncCount++;
          continue;
        }

        if (patchRes.status === 404) {
          // Event existiert noch nicht — erstellen mit fester ID
          const insertRes = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ ...eventBody, id: eventId }),
          });

          if (insertRes.ok) {
            syncCount++;
          } else {
            const errBody = await insertRes
              .text()
              .catch(() => `HTTP ${insertRes.status}`);
            failCount++;
            errors.push(
              `${p.projectNumber}: Insert fehlgeschlagen (${errBody.slice(0, 100)})`,
            );
          }
        } else {
          const errBody = await patchRes
            .text()
            .catch(() => `HTTP ${patchRes.status}`);
          failCount++;
          errors.push(
            `${p.projectNumber}: Update fehlgeschlagen (${errBody.slice(0, 100)})`,
          );
        }
      } catch (e) {
        failCount++;
        errors.push(
          `${p.projectNumber}: ${e instanceof Error ? e.message : 'Netzwerkfehler'}`,
        );
      }
    }

    // Status zusammenfassen
    const now = new Date().toISOString();
    let statusText: string;
    if (syncCount > 0 && failCount === 0) {
      statusText = `Erfolgreich: ${syncCount} Projekte synchronisiert`;
    } else if (syncCount > 0 && failCount > 0) {
      statusText = `Teilweise: ${syncCount} OK, ${failCount} fehlgeschlagen`;
    } else if (failCount > 0) {
      statusText = `Fehlgeschlagen: ${errors[0] ?? 'Unbekannter Fehler'}`;
    } else {
      statusText = 'Keine terminierten Projekte zum Synchronisieren';
    }

    const entries: [string, string | number][] = [
      ['gcal.lastSync', now],
      ['gcal.lastSyncStatus', statusText],
      ['gcal.lastSyncCount', syncCount],
    ];
    for (const [key, valueJson] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson },
        create: { key, valueJson },
      });
    }

    return {
      syncedAt: now,
      status: statusText,
      count: syncCount,
      failed: failCount,
      errors: errors.slice(0, 5),
    };
  }
}
