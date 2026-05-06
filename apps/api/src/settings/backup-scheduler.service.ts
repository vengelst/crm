import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

/**
 * Backup-Scheduler.
 *
 * Liest die Backup-Konfiguration aus der `Setting`-Tabelle (Keys
 * `backup.enabled`, `backup.interval`, `backup.time`, `backup.keepCount`)
 * und registriert je nach Konfiguration einen Cron-Job in der
 * `SchedulerRegistry`. Wird der Konfigurationsdatensatz veraendert (siehe
 * `SettingsService.updateBackupConfig`), ruft die SettingsService die
 * `reschedule()`-Methode dieses Services auf und der Job wird ohne
 * Container-Neustart neu geplant.
 *
 * Zeitzone: bewusst Server-Lokalzeit (CronJob ohne `timeZone`-Option). Das
 * ist die ueberraschungsaermste Variante fuer Admins, die die Zeit im
 * UI angeben — die Anzeige im Settings-UI laeuft ebenfalls in
 * Server-Lokalzeit.
 *
 * Status:
 *   - `nextRunAt` wird live aus `cronJob.nextDate()` berechnet (kein
 *     Persist-Bedarf — leitet sich aus der Konfiguration ab).
 *   - `lastRunAt` / `lastRunStatus` / `lastRunMessage` werden nach jedem
 *     Lauf in die `Setting`-Tabelle geschrieben (Backup-Settings sind ohnehin
 *     dort gepflegt, kein Schemawechsel noetig).
 */

const JOB_NAME = 'backup-scheduler';

const STATUS_KEYS = {
  lastRunAt: 'backup.lastRunAt',
  lastRunStatus: 'backup.lastRunStatus',
  lastRunMessage: 'backup.lastRunMessage',
  lastBackupId: 'backup.lastBackupId',
} as const;

export type BackupRunStatus = 'succeeded' | 'failed' | 'running';

export type BackupSchedulerStatus = {
  enabled: boolean;
  interval: string;
  time: string;
  keepCount: number;
  /** ISO-String, oder null wenn deaktiviert/keine gueltige Konfig. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: BackupRunStatus | null;
  lastRunMessage: string | null;
  lastBackupId: string | null;
  /** IANA-TZ-Name vom Server (z. B. "UTC" oder "Europe/Berlin"). */
  timezone: string;
  /** True solange ein Lauf aktiv ist (Cron oder manuell). */
  isRunning: boolean;
};

/**
 * Antwort fuer manuelle Trigger / Settings-Endpunkt, die wissen wollen ob
 * ein Backup ausgeloest wurde oder nur abgewiesen wegen Run-Lock.
 */
export type BackupTriggerOutcome =
  | { outcome: 'started'; backupId: string | null; status: BackupRunStatus }
  | { outcome: 'skipped'; reason: 'SKIPPED_ALREADY_RUNNING' };

@Injectable()
export class BackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupSchedulerService.name);
  /**
   * In-Memory-Lock: garantiert, dass innerhalb eines Prozesses nur ein
   * Backup-Lauf gleichzeitig laeuft (egal ob Cron-Tick oder manueller
   * Trigger). Das deckt den realistischen Single-Process-Deployment-Fall
   * ab. Fuer Multi-Replica-Setups muesste die Sperre in Postgres wandern
   * — bewusst nicht jetzt, weil das Setup hier eine Instanz hat.
   */
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────

  async onModuleInit() {
    // Beim App-Start einmal die Konfiguration einlesen und je nach
    // `enabled` einen Job registrieren. Fehler hier duerfen den Boot nicht
    // blockieren — schlimmstenfalls laeuft halt kein Auto-Backup, das
    // muss aber im Log sichtbar sein.
    try {
      await this.reschedule();
    } catch (e) {
      this.logger.error(
        `Backup-Scheduler-Init fehlgeschlagen: ${(e as Error).message}`,
      );
    }
  }

  onModuleDestroy() {
    this.unregisterIfPresent();
  }

  // ── oeffentliche API ──────────────────────────────────────────

  /**
   * Liest aktuelle Backup-Konfig + nextRunAt + last-* aus der DB. Wird
   * vom Settings-Controller fuer den Status-Endpoint genutzt.
   */
  async getStatus(): Promise<BackupSchedulerStatus> {
    const config = await this.settings.getBackupConfig();
    const status = await this.readStatusFromSettings();
    return {
      ...config,
      nextRunAt: this.computeNextRunAt(),
      ...status,
      timezone: serverTimezone(),
      isRunning: this.isRunning,
    };
  }

  /**
   * Loescht den existierenden Job (falls vorhanden) und registriert ihn
   * gemaess aktueller Konfig neu. Wird beim Boot und nach jeder
   * Settings-Aenderung aufgerufen.
   */
  async reschedule(): Promise<BackupSchedulerStatus> {
    this.unregisterIfPresent();
    const config = await this.settings.getBackupConfig();

    if (!config.enabled) {
      this.logger.log(
        'Backup-Scheduler: deaktiviert (backup.enabled=false), kein Job registriert.',
      );
      const status = await this.readStatusFromSettings();
      return {
        ...config,
        nextRunAt: null,
        ...status,
        timezone: serverTimezone(),
        isRunning: this.isRunning,
      };
    }

    const cronExpression = buildCronExpression(config.interval, config.time);
    if (!cronExpression) {
      this.logger.warn(
        `Backup-Scheduler: ungueltige Konfiguration (interval=${config.interval}, time=${config.time}), kein Job registriert.`,
      );
      const status = await this.readStatusFromSettings();
      return {
        ...config,
        nextRunAt: null,
        ...status,
        timezone: serverTimezone(),
        isRunning: this.isRunning,
      };
    }

    try {
      const job = new CronJob(cronExpression, () => {
        // Cron-Tick ist sync; den eigentlichen Lauf in Promise schieben,
        // Fehler abfangen — sonst kann eine Exception in der Callback den
        // Job laut cron-Lib nicht killen, aber wir wollen sauber loggen.
        this.runScheduledBackup('cron').catch((e: unknown) => {
          this.logger.error(
            `Auto-Backup-Tick fehlgeschlagen: ${(e as Error).message}`,
          );
        });
      });
      this.schedulerRegistry.addCronJob(
        JOB_NAME,
        job as unknown as Parameters<SchedulerRegistry['addCronJob']>[1],
      );
      job.start();
      this.logger.log(
        `Backup-Scheduler registriert: cron="${cronExpression}", naechster Lauf=${job.nextDate().toISO()}`,
      );
    } catch (e) {
      this.logger.error(
        `Backup-Scheduler konnte Job nicht registrieren: ${(e as Error).message}`,
      );
    }

    const status = await this.readStatusFromSettings();
    return {
      ...config,
      nextRunAt: this.computeNextRunAt(),
      ...status,
      timezone: serverTimezone(),
      isRunning: this.isRunning,
    };
  }

  /**
   * Manueller Trigger ueber den UI-Button (`POST /settings/backup/create`).
   * Geht durch denselben Run-Lock wie Cron-Ticks — gleichzeitige Backups
   * sind dadurch ausgeschlossen.
   *
   * Liefert das Backup-Outcome inklusive serialisiertem Backup-Record bei
   * Erfolg, oder `outcome: 'skipped'` wenn ein Lauf bereits aktiv ist.
   */
  async runManual(userId?: string): Promise<BackupTriggerOutcome> {
    return this.runScheduledBackup('manual', userId);
  }

  // ── interne Helfer ────────────────────────────────────────────

  /**
   * Eigentlicher Lauf inkl. Run-Lock. Wird aus dem Cron-Tick UND aus
   * `runWithLock` aufgerufen — beide Pfade duerfen sich nicht gegenseitig
   * blockieren oder doppelt anlaufen.
   *
   * Liefert ein `BackupTriggerOutcome`, damit Aufrufer (Cron/Manual)
   * den Status sauber loggen oder per HTTP-Antwort weitergeben koennen.
   */
  private async runScheduledBackup(
    source: 'cron' | 'manual',
    userId?: string,
  ): Promise<BackupTriggerOutcome> {
    if (this.isRunning) {
      this.logger.warn(
        `Backup-Lauf (${source}) abgewiesen: SKIPPED_ALREADY_RUNNING`,
      );
      return {
        outcome: 'skipped',
        reason: 'SKIPPED_ALREADY_RUNNING',
      };
    }

    this.isRunning = true;
    const startedAt = new Date();
    this.logger.log(
      `Auto-Backup gestartet (source=${source}, ${startedAt.toISOString()})`,
    );
    await this.writeStatus({
      lastRunAt: startedAt.toISOString(),
      lastRunStatus: 'running',
      lastRunMessage: null,
      lastBackupId: null,
    });

    try {
      const backup = await this.settings.createBackup(userId);
      const status: BackupRunStatus =
        backup?.status === 'READY' ? 'succeeded' : 'failed';
      const message =
        backup?.status === 'READY'
          ? null
          : (backup?.errorMessage ?? 'Backup mit Status FAILED beendet.');
      await this.writeStatus({
        lastRunAt: startedAt.toISOString(),
        lastRunStatus: status,
        lastRunMessage: message,
        lastBackupId: backup?.id ?? null,
      });
      this.logger.log(
        `Auto-Backup beendet: source=${source} status=${status} backupId=${backup?.id ?? '—'}`,
      );
      return {
        outcome: 'started',
        backupId: backup?.id ?? null,
        status,
      };
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      await this.writeStatus({
        lastRunAt: startedAt.toISOString(),
        lastRunStatus: 'failed',
        lastRunMessage: message,
        lastBackupId: null,
      });
      this.logger.error(
        `Auto-Backup fehlgeschlagen: source=${source} ${message}`,
      );
      // Ausnahme bewusst nicht weiterwerfen — Cron-Job soll stehen
      // bleiben und beim naechsten Tick erneut versuchen.
      return {
        outcome: 'started',
        backupId: null,
        status: 'failed',
      };
    } finally {
      this.isRunning = false;
    }
  }

  private unregisterIfPresent() {
    try {
      const existing = this.schedulerRegistry.getCronJob(JOB_NAME);
      void existing.stop();
      this.schedulerRegistry.deleteCronJob(JOB_NAME);
    } catch {
      // SchedulerRegistry wirft, wenn der Job nicht existiert — harmlos.
    }
  }

  private computeNextRunAt(): string | null {
    try {
      const job = this.schedulerRegistry.getCronJob(JOB_NAME);
      const next = job.nextDate();
      return next.toJSDate().toISOString();
    } catch {
      return null;
    }
  }

  private async readStatusFromSettings(): Promise<{
    lastRunAt: string | null;
    lastRunStatus: BackupRunStatus | null;
    lastRunMessage: string | null;
    lastBackupId: string | null;
  }> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: Object.values(STATUS_KEYS) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
    const status = byKey.get(STATUS_KEYS.lastRunStatus);
    return {
      lastRunAt:
        typeof byKey.get(STATUS_KEYS.lastRunAt) === 'string'
          ? (byKey.get(STATUS_KEYS.lastRunAt) as string)
          : null,
      lastRunStatus: isBackupStatus(status) ? status : null,
      lastRunMessage:
        typeof byKey.get(STATUS_KEYS.lastRunMessage) === 'string'
          ? (byKey.get(STATUS_KEYS.lastRunMessage) as string)
          : null,
      lastBackupId:
        typeof byKey.get(STATUS_KEYS.lastBackupId) === 'string'
          ? (byKey.get(STATUS_KEYS.lastBackupId) as string)
          : null,
    };
  }

  private async writeStatus(data: {
    lastRunAt: string | null;
    lastRunStatus: BackupRunStatus | null;
    lastRunMessage: string | null;
    lastBackupId: string | null;
  }) {
    const entries: [string, string | null][] = [
      [STATUS_KEYS.lastRunAt, data.lastRunAt],
      [STATUS_KEYS.lastRunStatus, data.lastRunStatus],
      [STATUS_KEYS.lastRunMessage, data.lastRunMessage],
      [STATUS_KEYS.lastBackupId, data.lastBackupId],
    ];
    for (const [key, value] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { valueJson: value as unknown as string },
        create: { key, valueJson: value as unknown as string },
      });
    }
  }
}

// ── Hilfsfunktionen ────────────────────────────────────────────

function isBackupStatus(value: unknown): value is BackupRunStatus {
  return (
    typeof value === 'string' &&
    (value === 'succeeded' || value === 'failed' || value === 'running')
  );
}

/**
 * Liefert die IANA-Zeitzone des Servers (z. B. "UTC" oder
 * "Europe/Berlin"). Faellt bei Plattformen ohne Intl-Resolver auf "UTC"
 * zurueck — der Cron-Job laeuft dann ohnehin in Server-Lokalzeit, das
 * Label ist aber konservativ korrekt.
 */
function serverTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Validiert eine `HH:mm`-Zeitangabe (24h, fuehrende Nullen optional fuer
 * Stunden, fuer Minuten Pflicht). Liefert `{ hour, minute }` oder null
 * bei ungueltiger Eingabe. Mehr als ein Cron-Builder bringt das nicht —
 * Sekunden werden bewusst nicht angeboten.
 */
export function parseHHmm(
  raw: string | null | undefined,
): { hour: number; minute: number } | null {
  if (typeof raw !== 'string') return null;
  const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match) return null;
  return {
    hour: Number.parseInt(match[1], 10),
    minute: Number.parseInt(match[2], 10),
  };
}

/**
 * Baut den Cron-Ausdruck fuer das Tripel (interval, time).
 *   - daily   HH:mm           → "mm HH * * *"
 *   - weekly  HH:mm Mo        → "mm HH * * 1"
 *   - monthly HH:mm 1. d. M.  → "mm HH 1 * *"
 *
 * Gibt null zurueck bei ungueltiger Eingabe — der Aufrufer entscheidet,
 * ob er log+skip oder throw will.
 */
export function buildCronExpression(
  interval: string,
  time: string,
): string | null {
  const hhmm = parseHHmm(time);
  if (!hhmm) return null;
  const { hour, minute } = hhmm;
  if (interval === 'daily') return `${minute} ${hour} * * *`;
  if (interval === 'weekly') return `${minute} ${hour} * * 1`;
  if (interval === 'monthly') return `${minute} ${hour} 1 * *`;
  return null;
}
