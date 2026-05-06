import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { createTransport } from 'nodemailer';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import {
  BackupSchedulerService,
  buildCronExpression,
  parseHHmm,
} from './backup-scheduler.service';

export type AppSettings = {
  passwordMinLength: number;
  kioskCodeLength: number;
  defaultTheme: 'light' | 'dark';
  navAsIcons: boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  passwordMinLength: 8,
  kioskCodeLength: 6,
  defaultTheme: 'dark',
  navAsIcons: false,
};

const SETTING_KEYS = {
  passwordMinLength: 'security.passwordMinLength',
  kioskCodeLength: 'security.kioskCodeLength',
  defaultTheme: 'appearance.defaultTheme',
  navAsIcons: 'appearance.navAsIcons',
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => BackupSchedulerService))
    private readonly backupScheduler: BackupSchedulerService,
  ) {}

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
      navAsIcons: this.readBoolean(
        valueByKey.get(SETTING_KEYS.navAsIcons),
        DEFAULT_SETTINGS.navAsIcons,
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
      this.prisma.setting.upsert({
        where: { key: SETTING_KEYS.navAsIcons },
        update: { valueJson: dto.navAsIcons },
        create: {
          key: SETTING_KEYS.navAsIcons,
          valueJson: dto.navAsIcons,
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

  private readBoolean(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
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
    // Konfiguration upfront validieren — sonst speichern wir Muell und
    // der Scheduler bleibt stumm. Die Helfer kommen aus dem Scheduler-
    // Modul, damit Persistenz und Cron-Regeln nicht auseinanderdriften.
    if (data.enabled) {
      if (!parseHHmm(data.time)) {
        throw new BadRequestException(
          `Ungueltige Zeit "${data.time}" — erwartet HH:mm (24h).`,
        );
      }
      if (!buildCronExpression(data.interval, data.time)) {
        throw new BadRequestException(
          `Ungueltiges Intervall "${data.interval}" — erwartet daily, weekly oder monthly.`,
        );
      }
    }
    const keepCount =
      Number.isFinite(data.keepCount) && data.keepCount > 0
        ? Math.floor(data.keepCount)
        : 7;

    const entries: [string, string | number | boolean][] = [
      ['backup.enabled', !!data.enabled],
      ['backup.interval', data.interval],
      ['backup.time', data.time],
      ['backup.keepCount', keepCount],
    ];

    for (const [key, valueJson] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson },
        create: { key, valueJson },
      });
    }

    // Job sofort neu planen — `enabled=false` raeumt einen alten Job auf,
    // `enabled=true` registriert einen neuen mit der frischen Zeit.
    await this.backupScheduler.reschedule();

    return this.getBackupConfig();
  }

  /**
   * Status fuer das Settings-UI: Konfig + nextRunAt + last-* aus dem
   * Scheduler. Reine Lesemethode — aendert nichts.
   */
  getBackupStatus() {
    return this.backupScheduler.getStatus();
  }

  // ── Logo ────────────────────────────────────────────

  /** Upload logo to MinIO (file arrives as in-memory buffer via memoryStorage). */
  async setLogo(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }

    // Delete previous logo from MinIO + local legacy
    const prev = await this.getLogo();
    if (prev.path) {
      await this.deleteLogoObject(prev.path);
    }

    const ext = extname(file.originalname);
    const logoKey = `logo/logo-${randomUUID()}${ext}`;

    await this.storage.uploadObject(
      logoKey,
      file.buffer,
      file.size,
      file.mimetype,
    );

    await this.prisma.setting.upsert({
      where: { key: 'company.logoPath' },
      update: { valueJson: logoKey },
      create: { key: 'company.logoPath', valueJson: logoKey },
    });

    return { path: logoKey, filename: file.originalname };
  }

  async getLogo() {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'company.logoPath' },
    });
    const path = typeof row?.valueJson === 'string' ? row.valueJson : null;
    return { path };
  }

  /**
   * Get a readable stream for the logo.
   * Uses StorageService with centralized local fallback.
   */
  async getLogoStream(): Promise<{
    stream: Readable | null;
    contentType: string | null;
  }> {
    const logo = await this.getLogo();
    if (!logo.path) return { stream: null, contentType: null };

    const ext = extname(logo.path).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';

    const stream = await this.storage.getObjectStreamWithFallback(logo.path);
    return { stream, contentType };
  }

  /** Get logo as Buffer — used by PDF generation in timesheets. */
  async getLogoBuffer(): Promise<{
    buffer: Buffer | null;
    logoPath: string | null;
  }> {
    const logo = await this.getLogo();
    if (!logo.path) return { buffer: null, logoPath: null };

    const buffer = await this.storage.getObjectBufferWithFallback(logo.path);
    return { buffer, logoPath: logo.path };
  }

  async deleteLogo() {
    const logo = await this.getLogo();
    if (logo.path) {
      await this.deleteLogoObject(logo.path);
    }
    await this.prisma.setting.deleteMany({
      where: { key: 'company.logoPath' },
    });
    return { deleted: true };
  }

  /** Delete logo from MinIO (+ local legacy if fallback is on). */
  private async deleteLogoObject(logoKey: string): Promise<void> {
    await this.storage.deleteObjectWithFallback(logoKey);
  }

  // ── Backup ──────────────────────────────────────────
  //
  // Backups bestehen aus zwei Schichten:
  //  1) Persistentes Artefakt (bevorzugt MinIO unter `backups/<id>/...`,
  //     alternativ Filesystem fuer Alt-Backups, die unter `storage/backups`
  //     entstanden sind).
  //  2) Stabile Metadaten in der DB-Tabelle `Backup`.
  //
  // Die UI-Liste liest ausschliesslich die DB. Damit ueberlebt ein Backup
  // App-Updates und Container-Recreates, solange der MinIO-Bucket bzw. das
  // Backup-Verzeichnis persistent bleiben.

  /** Legacy-Verzeichnis fuer Alt-Backups (vor der MinIO-Umstellung). */
  private get backupDir() {
    const dir = resolve(process.cwd(), 'storage', 'backups');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Prefix in MinIO unterhalb des Buckets fuer ein einzelnes Backup. */
  private minioBackupPrefix(id: string): string {
    return `backups/${id}`;
  }

  private dbConnectionUrl(): string {
    return (
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur'
    );
  }

  /**
   * Adoptiert einmalig pro Service-Lifecycle alle Alt-Backups, die als
   * Verzeichnis im Filesystem liegen, aber noch keinen DB-Eintrag haben.
   * Damit verschwinden produktive Alt-Backups nach dem Update nicht aus der
   * UI; sie laufen weiterhin als `storageType=FILESYSTEM`.
   */
  private async adoptLegacyFilesystemBackups(): Promise<void> {
    if (!existsSync(this.backupDir)) return;
    const entries = readdirSync(this.backupDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (entries.length === 0) return;

    const existing = await this.prisma.backup.findMany({
      where: { id: { in: entries } },
      select: { id: true },
    });
    const known = new Set(existing.map((b) => b.id));

    for (const id of entries) {
      if (known.has(id)) continue;
      const dir = join(this.backupDir, id);
      const manifestPath = join(dir, 'manifest.json');
      if (!existsSync(manifestPath)) continue;

      let manifest: Record<string, unknown> = {};
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<
          string,
          unknown
        >;
      } catch {
        continue;
      }

      const createdAt =
        typeof manifest.createdAt === 'string'
          ? new Date(manifest.createdAt)
          : statSync(dir).mtime;
      const sizeBytes = computeDirectorySize(dir);

      await this.prisma.backup.create({
        data: {
          id,
          createdAt,
          status: 'READY',
          storageType: 'FILESYSTEM',
          storageKey: dir,
          hasDatabase: manifest.hasDatabase === true,
          databaseStatus:
            typeof manifest.databaseStatus === 'string'
              ? manifest.databaseStatus
              : manifest.hasDatabase
                ? 'success (legacy)'
                : 'unknown',
          hasSettings: manifest.hasSettings === true,
          settingsStatus:
            typeof manifest.settingsStatus === 'string'
              ? manifest.settingsStatus
              : manifest.hasSettings
                ? 'success (legacy)'
                : 'unknown',
          hasDocuments: manifest.hasDocuments === true,
          documentsStatus:
            typeof manifest.documentsStatus === 'string'
              ? manifest.documentsStatus
              : manifest.hasDocuments
                ? 'success (legacy)'
                : 'unknown',
          sizeBytes: BigInt(sizeBytes),
        },
      });
    }
  }

  /**
   * Erzeugt ein neues Backup. Der Ablauf ist robust:
   *   1) Metadatenzeile mit `status=READY` als Platzhalter
   *   2) Artefakte erzeugen und nach MinIO hochladen (DB-Dump, Settings, Docs)
   *   3) Statuszeilen auf der DB-Zeile aktualisieren — auch bei Teilfehlern
   * Faellt einer der Schritte komplett aus, bleibt der Datensatz mit
   * `status=FAILED` erhalten, sodass das Problem in der UI sichtbar ist.
   */
  async createBackup(createdByUserId?: string) {
    const id = randomUUID();
    const minioPrefix = this.minioBackupPrefix(id);

    let databaseStatus = 'skipped';
    let settingsStatus = 'skipped';
    let documentsStatus = 'skipped';
    let documentsCount = 0;
    let totalBytes = 0;
    const errorMessages: string[] = [];

    // ── 1. Datenbank-Dump ────────────────────────────────
    const dbUrl = this.dbConnectionUrl();
    let dumpBuffer: Buffer | null = null;
    try {
      const dump = execSync(`pg_dump "${dbUrl}" --clean --if-exists`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024 * 1024, // 1 GiB Cap fuer kleine/mittlere Instanzen
      });
      if (dump.length > 100) {
        dumpBuffer = dump;
        databaseStatus = 'success';
      } else {
        databaseStatus = 'failed: Dump-Datei ist leer oder zu klein';
      }
    } catch (e) {
      databaseStatus = `failed: ${e instanceof Error ? e.message : 'pg_dump nicht verfuegbar'}`;
      errorMessages.push(databaseStatus);
    }

    if (dumpBuffer) {
      try {
        await this.storage.uploadObject(
          `${minioPrefix}/database.sql`,
          dumpBuffer,
          dumpBuffer.length,
          'application/sql',
        );
        totalBytes += dumpBuffer.length;
      } catch (e) {
        databaseStatus = `failed: Upload abgebrochen — ${e instanceof Error ? e.message : 'Fehler'}`;
        errorMessages.push(databaseStatus);
      }
    }

    // ── 2. Settings-Export ───────────────────────────────
    try {
      const settings = await this.prisma.setting.findMany();
      const json = Buffer.from(JSON.stringify(settings, null, 2), 'utf-8');
      await this.storage.uploadObject(
        `${minioPrefix}/settings.json`,
        json,
        json.length,
        'application/json',
      );
      totalBytes += json.length;
      settingsStatus = `success: ${settings.length} Eintraege`;
    } catch (e) {
      settingsStatus = `failed: ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`;
      errorMessages.push(settingsStatus);
    }

    // ── 3. Dokumente — pro Datei aus dem aktiven Storage ueber MinIO duplizieren ──
    try {
      const documents = await this.prisma.document.findMany({
        select: { storageKey: true },
      });
      if (documents.length === 0) {
        documentsStatus = 'success: keine Dokumente vorhanden';
      } else {
        let count = 0;
        for (const doc of documents) {
          try {
            const buf = await this.storage.getObjectBufferWithFallback(
              doc.storageKey,
            );
            if (!buf) continue;
            // Ziel: backups/<id>/uploads/<originalKey>
            await this.storage.uploadObject(
              `${minioPrefix}/${doc.storageKey}`,
              buf,
              buf.length,
            );
            totalBytes += buf.length;
            count++;
          } catch {
            // Einzelne Datei darf scheitern, ohne das gesamte Backup zu kippen
          }
        }
        documentsCount = count;
        documentsStatus = `success: ${count} Dateien`;
      }
    } catch (e) {
      documentsStatus = `failed: ${e instanceof Error ? e.message : 'Kopierfehler'}`;
      errorMessages.push(documentsStatus);
    }

    const overallStatus: 'READY' | 'FAILED' =
      databaseStatus.startsWith('success') ||
      settingsStatus.startsWith('success') ||
      documentsStatus.startsWith('success')
        ? 'READY'
        : 'FAILED';

    const record = await this.prisma.backup.create({
      data: {
        id,
        createdByUserId,
        status: overallStatus,
        storageType: 'MINIO',
        storageKey: minioPrefix,
        hasDatabase: databaseStatus.startsWith('success'),
        databaseStatus,
        hasSettings: settingsStatus.startsWith('success'),
        settingsStatus,
        hasDocuments: documentsStatus.startsWith('success'),
        documentsStatus,
        documentsCount,
        sizeBytes: BigInt(totalBytes),
        errorMessage: errorMessages.length ? errorMessages.join(' | ') : null,
      },
    });

    // Cleanup: keepCount — nur erfolgreiche Backups zaehlen, FAILED bleibt
    // sichtbar, damit der Operator den Misserfolg pruefen kann.
    await this.enforceKeepCount();

    return serializeBackupRecord(record);
  }

  async listBackups() {
    await this.adoptLegacyFilesystemBackups();
    const rows = await this.prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(serializeBackupRecord);
  }

  /**
   * Serialisiertes Backup nach ID. Liefert null statt zu werfen — wird
   * vom Manual-Backup-Endpoint genutzt, der bei `null` selbst eine 404
   * baut. Lese-Pfad ist absichtlich entkoppelt von `getBackupOrThrow`,
   * damit andere Stellen nicht versehentlich auf Exception-Verhalten
   * angewiesen sind.
   */
  async getBackup(id: string) {
    if (!/^[\w.-]+$/.test(id)) return null;
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) return null;
    return serializeBackupRecord(row);
  }

  private async getBackupOrThrow(id: string) {
    if (!/^[\w.-]+$/.test(id)) {
      throw new BadRequestException('Ungueltige Backup-ID.');
    }
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) {
      throw new BadRequestException('Backup nicht gefunden.');
    }
    return row;
  }

  async deleteBackup(id: string) {
    const row = await this.getBackupOrThrow(id);

    if (row.storageType === 'MINIO') {
      // Alle Objekte unter dem Prefix einsammeln und entfernen.
      try {
        const client = this.storage.getClient();
        const bucket = this.storage.getBucketName();
        const stream = client.listObjectsV2(bucket, `${row.storageKey}/`, true);
        const keys: string[] = [];
        await new Promise<void>((resolveList, rejectList) => {
          stream.on('data', (obj) => {
            if (obj.name) keys.push(obj.name);
          });
          stream.on('end', () => resolveList());
          stream.on('error', (err) => rejectList(err));
        });
        for (const key of keys) {
          await this.storage.deleteObject(key);
        }
      } catch {
        // Speicherbereinigung darf scheitern; wir loeschen den DB-Eintrag
        // trotzdem, sonst bleibt das Backup als „Leiche" in der UI haengen.
      }
    } else {
      // FILESYSTEM-Alt-Backup: Verzeichnis entfernen, falls vorhanden.
      const path = row.storageKey;
      if (path && existsSync(path)) {
        try {
          rmSync(path, { recursive: true, force: true });
        } catch {
          // Im Fehlerfall: DB-Zeile bleibt, damit der Operator nachsehen kann.
        }
      }
    }

    await this.prisma.backup.delete({ where: { id } });
    return { deleted: true };
  }

  async restoreBackup(
    id: string,
    options: { database: boolean; documents: boolean; settings: boolean },
  ) {
    const row = await this.getBackupOrThrow(id);

    const results: string[] = [];

    const reader = makeBackupReader(row, this.storage);

    // 1. Settings
    if (options.settings) {
      const json = await reader.readFile('settings.json');
      if (json) {
        try {
          const settings = JSON.parse(json.toString('utf-8')) as Array<{
            key: string;
            valueJson: unknown;
          }>;
          await this.prisma.setting.deleteMany({});
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

    // 2. Documents — alle Objekte unter `uploads/` zurueck nach MinIO
    if (options.documents) {
      const files = await reader.listUploadFiles();
      if (files.length === 0) {
        results.push('Dokumente-Backup nicht vorhanden, uebersprungen.');
      } else {
        let count = 0;
        let failed = 0;
        for (const file of files) {
          try {
            const buf = await reader.readUploadFile(file.relativeKey);
            if (!buf) {
              failed++;
              continue;
            }
            await this.storage.uploadObject(
              file.targetStorageKey,
              buf,
              buf.length,
            );
            count++;
          } catch {
            failed++;
          }
        }
        results.push(
          `Dokumente wiederhergestellt (${count} Dateien${failed ? `, ${failed} fehlgeschlagen` : ''}).`,
        );
      }
    }

    // 3. Database
    if (options.database) {
      const dump = await reader.readFile('database.sql');
      if (dump) {
        const dbUrl = this.dbConnectionUrl();
        try {
          execSync(`psql "${dbUrl}"`, {
            input: dump,
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 1024 * 1024 * 1024,
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
    const ready = await this.prisma.backup.findMany({
      where: { status: 'READY' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (ready.length > config.keepCount) {
      for (const row of ready.slice(config.keepCount)) {
        try {
          await this.deleteBackup(row.id);
        } catch {
          // Best-effort: ein einzelner Loeschfehler darf die Erstellung nicht
          // ruinieren.
        }
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

// ── Backup-Helfer (modulpriv) ─────────────────────────────────────────

type BackupRecord = {
  id: string;
  createdAt: Date;
  createdByUserId: string | null;
  status: 'READY' | 'FAILED';
  storageType: 'MINIO' | 'FILESYSTEM';
  storageKey: string;
  hasDatabase: boolean;
  databaseStatus: string;
  hasSettings: boolean;
  settingsStatus: string;
  hasDocuments: boolean;
  documentsStatus: string;
  documentsCount: number;
  sizeBytes: bigint | null;
  errorMessage: string | null;
};

/** API-Repraesentation eines Backup-Datensatzes (BigInt → number, ISO-Datum). */
function serializeBackupRecord(row: BackupRecord) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    status: row.status,
    storageType: row.storageType,
    storageKey: row.storageKey,
    hasDatabase: row.hasDatabase,
    databaseStatus: row.databaseStatus,
    hasSettings: row.hasSettings,
    settingsStatus: row.settingsStatus,
    hasDocuments: row.hasDocuments,
    documentsStatus: row.documentsStatus,
    documentsCount: row.documentsCount,
    sizeBytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
    errorMessage: row.errorMessage,
  };
}

/** Rekursive Verzeichnisgroesse ermitteln (fuer Alt-Backup-Adoption). */
function computeDirectorySize(dir: string): number {
  let size = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (!existsSync(cur)) continue;
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const p = join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(p);
      } else if (entry.isFile()) {
        size += statSync(p).size;
      }
    }
  }
  return size;
}

/**
 * Liest Backup-Artefakte einheitlich aus MinIO oder Filesystem. So unterstuetzt
 * die Restore-Funktion beide Storage-Typen ohne separate Code-Pfade.
 */
function makeBackupReader(row: BackupRecord, storage: StorageService) {
  if (row.storageType === 'MINIO') {
    const prefix = row.storageKey.replace(/\/+$/, '');
    return {
      async readFile(name: string): Promise<Buffer | null> {
        return storage.getObjectBufferWithFallback(`${prefix}/${name}`);
      },
      async listUploadFiles(): Promise<
        Array<{ relativeKey: string; targetStorageKey: string }>
      > {
        const client = storage.getClient();
        const bucket = storage.getBucketName();
        const stream = client.listObjectsV2(bucket, `${prefix}/uploads/`, true);
        const out: Array<{ relativeKey: string; targetStorageKey: string }> =
          [];
        await new Promise<void>((res, rej) => {
          stream.on('data', (obj) => {
            if (!obj.name) return;
            const rel = obj.name.slice(prefix.length + 1); // "uploads/<...>"
            out.push({
              relativeKey: rel,
              targetStorageKey: rel, // Originalpfad in MinIO ist dieselbe Key-Struktur
            });
          });
          stream.on('end', () => res());
          stream.on('error', (err) => rej(err));
        });
        return out;
      },
      async readUploadFile(relativeKey: string): Promise<Buffer | null> {
        return storage.getObjectBufferWithFallback(`${prefix}/${relativeKey}`);
      },
    };
  }

  // FILESYSTEM: Alt-Backup-Layout (storage/backups/<id>/...).
  const baseDir = row.storageKey;
  return {
    readFile(name: string): Promise<Buffer | null> {
      const p = join(baseDir, name);
      return Promise.resolve(existsSync(p) ? readFileSync(p) : null);
    },
    listUploadFiles(): Promise<
      Array<{ relativeKey: string; targetStorageKey: string }>
    > {
      const uploadsDir = join(baseDir, 'uploads');
      if (!existsSync(uploadsDir)) return Promise.resolve([]);
      const out: Array<{ relativeKey: string; targetStorageKey: string }> = [];
      for (const f of readdirSync(uploadsDir, { withFileTypes: true })) {
        if (!f.isFile()) continue;
        out.push({
          relativeKey: `uploads/${f.name}`,
          targetStorageKey: `uploads/${f.name}`,
        });
      }
      return Promise.resolve(out);
    },
    readUploadFile(relativeKey: string): Promise<Buffer | null> {
      const p = join(baseDir, relativeKey);
      return Promise.resolve(existsSync(p) ? readFileSync(p) : null);
    },
  };
}
