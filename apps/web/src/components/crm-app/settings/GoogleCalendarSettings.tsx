"use client";
import { useI18n } from "../../../i18n-context";

import { type FormEvent, useEffect, useState } from "react";
import { SectionCard, PrimaryButton, Field } from "../shared";

export function GoogleCalendarSettings({ apiFetch, setPanelSuccess, setPanelError }: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: (v: string | null) => void;
  setPanelError: (v: string | null) => void;
}) {
  const { t: l, locale } = useI18n();
  const [gcalForm, setGcalForm] = useState({ clientId: "", clientSecret: "", calendarId: "", enabled: false });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ lastSync: string | null; lastSyncStatus: string | null; lastSyncCount: number }>({ lastSync: null, lastSyncStatus: null, lastSyncCount: 0 });

  useEffect(() => {
    void apiFetch<typeof gcalForm>("/settings/google-calendar").then(setGcalForm).catch(() => {});
    void apiFetch<typeof syncStatus>("/settings/google-calendar/status").then(setSyncStatus).catch(() => {});
  }, [apiFetch]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setPanelError(null);
    try {
      await apiFetch("/settings/google-calendar", { method: "PUT", body: JSON.stringify(gcalForm) });
      setPanelSuccess(l("settings.gcalSaved"));
    } catch (err) { setPanelError(err instanceof Error ? err.message : l("common.error")); }
    finally { setSaving(false); }
  }

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

  return (
    <div className="grid gap-6">
      <SectionCard title={l("settings.gcal")} subtitle={l("settings.gcalSub")}>
        <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void save(e)}>
          <label className="inline-flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={gcalForm.enabled} onChange={(e) => setGcalForm((c) => ({ ...c, enabled: e.target.checked }))} />
            {l("settings.gcalEnabledLabel")}
          </label>
          <Field label={l("settings.gcalServiceEmail")} value={gcalForm.clientId} onChange={(e) => setGcalForm((c) => ({ ...c, clientId: e.target.value }))} />
          <Field label={l("settings.gcalAccessToken")} type="password" value={gcalForm.clientSecret} onChange={(e) => setGcalForm((c) => ({ ...c, clientSecret: e.target.value }))} />
          <Field label={l("settings.gcalCalIdHint")} value={gcalForm.calendarId} onChange={(e) => setGcalForm((c) => ({ ...c, calendarId: e.target.value }))} />
          <p className="text-xs text-slate-500">
            {l("settings.gcalHelp")}
          </p>
          <PrimaryButton disabled={saving}>{saving ? l("common.saving") : l("settings.gcalSave")}</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title={l("settings.gcalSyncTitle")} subtitle={l("settings.gcalSyncSub")}>
        <div className="grid gap-4">
          {syncStatus.lastSync ? (
            <div className="rounded-xl border border-black/10 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-slate-950/30">
              <div className="text-xs text-slate-500">{l("settings.gcalLastSync")} {new Date(syncStatus.lastSync).toLocaleString(locale)}</div>
              <div className="text-sm font-medium">{syncStatus.lastSyncStatus}</div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{l("settings.gcalNeverSynced")}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={syncing || !gcalForm.enabled} onClick={async () => {
              setSyncing(true); setPanelError(null);
              try {
                const r = await apiFetch<{ syncedAt: string; status: string; count: number }>("/settings/google-calendar/sync", { method: "POST" });
                setPanelSuccess(r.status);
                setSyncStatus({ lastSync: r.syncedAt, lastSyncStatus: r.status, lastSyncCount: r.count });
              } catch (e) { setPanelError(e instanceof Error ? e.message : l("settings.gcalSyncFailed")); }
              finally { setSyncing(false); }
            }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
              {syncing ? l("settings.gcalSyncing") : l("settings.gcalSyncNow")}
            </button>
            <a href={`${apiRoot}/api/projects/export/ical`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
              iCal-Export (.ics)
            </a>
          </div>
          {!gcalForm.enabled ? <p className="text-xs text-amber-600 dark:text-amber-400">{l("settings.gcalDisabled")}</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}

