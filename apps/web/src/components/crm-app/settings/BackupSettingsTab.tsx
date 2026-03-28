"use client";
import { useI18n } from "../../../i18n-context";

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
  const { t: l, locale } = useI18n();
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
      setPanelSuccess(l("settings.backupCreated"));
      await loadBackups();
    } catch (e) { setPanelError(e instanceof Error ? e.message : l("settings.backupFailed")); }
    finally { setCreating(false); }
  }

  async function deleteBackup(id: string) {
    if (!window.confirm(l("settings.backupConfirmDelete"))) return;
    try {
      await apiFetch(`/settings/backup/${id}`, { method: "DELETE" });
      setPanelSuccess(l("settings.backupDeleted"));
      await loadBackups();
    } catch (e) { setPanelError(e instanceof Error ? e.message : l("common.error")); }
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
    } catch (e) { setPanelError(e instanceof Error ? e.message : l("common.error")); }
    finally { setRestoring(false); }
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  return (
    <div className="grid gap-6">
      <SectionCard title={l("settings.backupManual")} subtitle={l("settings.backupSub")}>
        <button type="button" disabled={creating} onClick={() => void createBackup()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
          {creating ? l("settings.backupCreating") : l("settings.backupCreate")}
        </button>
      </SectionCard>

      <SectionCard title={l("settings.backupList")} subtitle={`${backups.length} ${l("settings.backupStoredCount")}`}>
        {backups.length === 0 ? (
          <p className="text-sm text-slate-500">{l("settings.backupNone")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-2">ID</th>
                  <th className="pb-2 pr-2">{l("table.created")}</th>
                  <th className="pb-2 pr-2">{l("table.content")}</th>
                  <th className="pb-2 pr-2 text-right">{l("table.size")}</th>
                  <th className="pb-2">{l("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-2 font-mono text-xs">{b.id}</td>
                    <td className="py-2 pr-2 text-xs">{new Date(b.createdAt).toLocaleString(locale)}</td>
                    <td className="py-2 pr-2 text-xs">
                      <span className={b.hasDatabase ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{l("settings.backupDBLabel")}{b.hasDatabase ? l("common.ok") : l("common.error")}</span>
                      {" "}
                      <span className={b.hasSettings ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{l("settings.backupSetLabel")}{b.hasSettings ? l("common.ok") : l("common.error")}</span>
                      {" "}
                      <span className={b.hasDocuments ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>{l("settings.backupDocLabel")}{b.hasDocuments ? l("common.ok") : "-"}</span>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-xs">{fmtSize(b.sizeBytes)}</td>
                    <td className="py-2 text-xs">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => { setRestoreId(b.id); setRestoreOpts({ database: true, documents: true, settings: true }); }}
                          className="rounded border border-emerald-300 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400">{l("settings.backupRestore")}</button>
                        <button type="button" onClick={() => void deleteBackup(b.id)}
                          className="rounded border border-red-300 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400">{l("common.delete")}</button>
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
        <SectionCard title={l("settings.backupRestoreTitle")} subtitle={`Backup ${restoreId} wiederherstellen.`}>
          <div className="grid gap-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-400">
              {l("settings.backupRestoreWarn")}
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.database} onChange={(e) => setRestoreOpts((c) => ({ ...c, database: e.target.checked }))} /> {l("settings.backupDatabase")}</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.documents} onChange={(e) => setRestoreOpts((c) => ({ ...c, documents: e.target.checked }))} /> {l("settings.backupDocuments")}</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={restoreOpts.settings} onChange={(e) => setRestoreOpts((c) => ({ ...c, settings: e.target.checked }))} /> {l("settings.backupSettingsLabel")}</label>
            </div>
            <div className="flex gap-3">
              <button type="button" disabled={restoring} onClick={() => void restore()}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
                {restoring ? l("settings.backupRestoring") : l("settings.backupRestore")}
              </button>
              <SecondaryButton onClick={() => setRestoreId(null)}>{l("common.cancel")}</SecondaryButton>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={l("settings.backupAutoTitle")} subtitle={l("settings.backupAutoSub")}>
        <form className="grid gap-4 md:max-w-2xl" onSubmit={onSaveConfig}>
          <label className="inline-flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={backupForm.enabled} onChange={(e) => setBackupForm((c) => ({ ...c, enabled: e.target.checked }))} />
            {l("settings.backupEnabled")}
          </label>
          <FormRow>
            <SelectField label={l("settings.backupInterval")} value={backupForm.interval} onChange={(e) => setBackupForm((c) => ({ ...c, interval: e.target.value }))}
              options={[{ value: "daily", label: l("settings.backupDaily") }, { value: "weekly", label: l("settings.backupWeekly") }, { value: "monthly", label: l("settings.backupMonthly") }]} />
            <Field label={l("settings.backupTime")} value={backupForm.time} onChange={(e) => setBackupForm((c) => ({ ...c, time: e.target.value }))} />
          </FormRow>
          <Field label={l("settings.backupKeepLabel")} value={backupForm.keepCount} onChange={(e) => setBackupForm((c) => ({ ...c, keepCount: e.target.value }))} />
          <PrimaryButton disabled={submitting}>{submitting ? l("common.saving") : l("settings.backupSaveConfig")}</PrimaryButton>
        </form>
      </SectionCard>
    </div>
  );
}

