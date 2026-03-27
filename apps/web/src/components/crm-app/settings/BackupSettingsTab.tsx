"use client";

import { type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction, useCallback, useEffect, useState } from "react";
import { SectionCard, SecondaryButton, PrimaryButton, FormRow, Field, SelectField, MessageBar } from "../shared";

type BackupEntry = {
  id: string;
  createdAt: string;
  hasDatabase: boolean;
  hasSettings: boolean;
  hasDocuments: boolean;
  sizeBytes: number;
  databaseStatus?: string;
};

export function BackupSettingsTab({ backupForm, setBackupForm, onSaveConfig, submitting, apiFetch, setPanelSuccess, setPanelError }: {
  backupForm: { enabled: boolean; interval: string; time: string; keepCount: string };
  setBackupForm: Dispatch<SetStateAction<typeof backupForm>>;
  onSaveConfig: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: (v: string | null) => void;
  setPanelError: (v: string | null) => void;
}) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreOpts, setRestoreOpts] = useState({ database: true, documents: true, settings: true });
  const [restoring, setRestoring] = useState(false);

  const loadBackups = useCallback(async () => {
    try { const list = await apiFetch<BackupEntry[]>("/settings/backup/list"); setBackups(list); } catch { /* skip */ }
  }, [apiFetch]);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  async function createBackup() {
    setCreating(true); setPanelError(null);
    try {
      await apiFetch("/settings/backup/create", { method: "POST" });
      setPanelSuccess("Backup erstellt.");
      await loadBackups();
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Backup fehlgeschlagen."); }
    finally { setCreating(false); }
  }

  async function deleteBackup(id: string) {
    if (!window.confirm("Backup wirklich loeschen?")) return;
    try {
      await apiFetch(`/settings/backup/${id}`, { method: "DELETE" });
      setPanelSuccess("Backup geloescht.");
      await loadBackups();
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler."); }
  }

  async function restore() {
    if (!restoreId) return;
    if (!window.confirm("ACHTUNG: Ausgewaehlte Daten werden ueberschrieben. Fortfahren?")) return;
    setRestoring(true); setPanelError(null);
    try {
      const r = await apiFetch<{ restored: string[] }>(`/settings/backup/${restoreId}/restore`, {
        method: "POST",
        body: JSON.stringify(restoreOpts),
      });
      setPanelSuccess(r.restored.join(" "));
      setRestoreId(null);
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Restore fehlgeschlagen."); }
    finally { setRestoring(false); }
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  return (
    <div className="grid gap-6">
      <SectionCard title="Manuelles Backup" subtitle="Erstellt ein Backup von Datenbank, Dokumenten und Einstellungen.">
        <button type="button" disabled={creating} onClick={() => void createBackup()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
          {creating ? "Erstelle Backup ..." : "Backup jetzt erstellen"}
        </button>
      </SectionCard>

      <SectionCard title="Vorhandene Backups" subtitle={`${backups.length} Backup(s) gespeichert.`}>
        {backups.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Backups vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-2">ID</th>
                  <th className="pb-2 pr-2">Erstellt</th>
                  <th className="pb-2 pr-2">Inhalt</th>
                  <th className="pb-2 pr-2 text-right">Groesse</th>
                  <th className="pb-2">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-2 font-mono text-xs">{b.id}</td>
                    <td className="py-2 pr-2 text-xs">{new Date(b.createdAt).toLocaleString("de-DE")}</td>
                    <td className="py-2 pr-2 text-xs">
                      <span className={b.hasDatabase ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>DB:{b.hasDatabase ? "OK" : "Fehler"}</span>
                      {" "}
                      <span className={b.hasSettings ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>Set:{b.hasSettings ? "OK" : "Fehler"}</span>
                      {" "}
                      <span className={b.hasDocuments ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>Dok:{b.hasDocuments ? "OK" : "-"}</span>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-xs">{fmtSize(b.sizeBytes)}</td>
                    <td className="py-2 text-xs">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => { setRestoreId(b.id); setRestoreOpts({ database: true, documents: true, settings: true }); }}
                          className="rounded border border-emerald-300 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400">Restore</button>
                        <button type="button" onClick={() => void deleteBackup(b.id)}
                          className="rounded border border-red-300 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400">Loeschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {restoreId ? (
        <SectionCard title="Wiederherstellung" subtitle={`Backup ${restoreId} wiederherstellen.`}>
          <div className="grid gap-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-400">
              Achtung: Die ausgewaehlten Daten werden mit dem Backup-Stand ueberschrieben.
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.database} onChange={(e) => setRestoreOpts((c) => ({ ...c, database: e.target.checked }))} /> Datenbank</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.documents} onChange={(e) => setRestoreOpts((c) => ({ ...c, documents: e.target.checked }))} /> Dokumente</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.settings} onChange={(e) => setRestoreOpts((c) => ({ ...c, settings: e.target.checked }))} /> Einstellungen</label>
            </div>
            <div className="flex gap-3">
              <button type="button" disabled={restoring} onClick={() => void restore()}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
                {restoring ? "Stelle wieder her ..." : "Wiederherstellen"}
              </button>
              <SecondaryButton onClick={() => setRestoreId(null)}>Abbrechen</SecondaryButton>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Automatische Backups" subtitle="Zeitgesteuerte Datensicherung konfigurieren.">
        <form className="grid gap-4 md:max-w-2xl" onSubmit={onSaveConfig}>
          <label className="inline-flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={backupForm.enabled} onChange={(e) => setBackupForm((c) => ({ ...c, enabled: e.target.checked }))} />
            Automatische Backups aktiviert
          </label>
          <FormRow>
            <SelectField label="Intervall" value={backupForm.interval} onChange={(e) => setBackupForm((c) => ({ ...c, interval: e.target.value }))}
              options={[{ value: "daily", label: "Taeglich" }, { value: "weekly", label: "Woechentlich" }, { value: "monthly", label: "Monatlich" }]} />
            <Field label="Uhrzeit" value={backupForm.time} onChange={(e) => setBackupForm((c) => ({ ...c, time: e.target.value }))} />
          </FormRow>
          <Field label="Aufzubewahrende Backups" value={backupForm.keepCount} onChange={(e) => setBackupForm((c) => ({ ...c, keepCount: e.target.value }))} />
          <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Backup-Konfiguration speichern"}</PrimaryButton>
        </form>
      </SectionCard>
    </div>
  );
}

