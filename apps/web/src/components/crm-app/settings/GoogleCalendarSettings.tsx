"use client";

import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useState } from "react";
import { SectionCard, SecondaryButton, PrimaryButton, FormRow, Field, SelectField } from "../shared";

export function GoogleCalendarSettings({ apiFetch, setPanelSuccess, setPanelError }: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: (v: string | null) => void;
  setPanelError: (v: string | null) => void;
}) {
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
      setPanelSuccess("Google-Kalender-Konfiguration gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler."); }
    finally { setSaving(false); }
  }

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

  return (
    <div className="grid gap-6">
      <SectionCard title="Google Kalender" subtitle="Projekttermine mit Google Kalender synchronisieren.">
        <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void save(e)}>
          <label className="inline-flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={gcalForm.enabled} onChange={(e) => setGcalForm((c) => ({ ...c, enabled: e.target.checked }))} />
            Google-Kalender-Abgleich aktiviert
          </label>
          <Field label="Service-Account E-Mail (optional)" value={gcalForm.clientId} onChange={(e) => setGcalForm((c) => ({ ...c, clientId: e.target.value }))} />
          <Field label="OAuth2 Access Token" type="password" value={gcalForm.clientSecret} onChange={(e) => setGcalForm((c) => ({ ...c, clientSecret: e.target.value }))} />
          <Field label="Kalender-ID (z.B. primary oder user@gmail.com)" value={gcalForm.calendarId} onChange={(e) => setGcalForm((c) => ({ ...c, calendarId: e.target.value }))} />
          <p className="text-xs text-slate-500">
            Access Token kann ueber Google Cloud Console / OAuth 2.0 Playground generiert werden.
            Kalender-ID findet sich in den Google Kalender-Einstellungen unter Kalenderdetails.
          </p>
          <PrimaryButton disabled={saving}>{saving ? "Speichert ..." : "Konfiguration speichern"}</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Synchronisierung" subtitle="Projekttermine in Google Kalender uebertragen.">
        <div className="grid gap-4">
          {syncStatus.lastSync ? (
            <div className="rounded-xl border border-black/10 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-slate-950/30">
              <div className="text-xs text-slate-500">Letzter Sync: {new Date(syncStatus.lastSync).toLocaleString("de-DE")}</div>
              <div className="text-sm font-medium">{syncStatus.lastSyncStatus}</div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Noch nie synchronisiert.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={syncing || !gcalForm.enabled} onClick={async () => {
              setSyncing(true); setPanelError(null);
              try {
                const r = await apiFetch<{ syncedAt: string; status: string; count: number }>("/settings/google-calendar/sync", { method: "POST" });
                setPanelSuccess(r.status);
                setSyncStatus({ lastSync: r.syncedAt, lastSyncStatus: r.status, lastSyncCount: r.count });
              } catch (e) { setPanelError(e instanceof Error ? e.message : "Sync fehlgeschlagen."); }
              finally { setSyncing(false); }
            }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
              {syncing ? "Synchronisiert ..." : "Jetzt synchronisieren"}
            </button>
            <a href={`${apiRoot}/api/projects/export/ical`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
              iCal-Export (.ics)
            </a>
          </div>
          {!gcalForm.enabled ? <p className="text-xs text-amber-600 dark:text-amber-400">Google-Kalender ist deaktiviert. Bitte oben aktivieren und Kalender-ID eintragen.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}

