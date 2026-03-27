"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { SectionCard, SecondaryButton } from "../shared";

export function ReminderSettings({ apiFetch, setPanelSuccess, setPanelError }: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: Dispatch<SetStateAction<string | null>>;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const [config, setConfig] = useState({ enabled: false, missingTime: false, openSignatures: false, openApprovals: false, projectStart: false, emailEnabled: false, intervalHours: 24 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void apiFetch<typeof config>("/reminders/config").then(setConfig).catch(() => {}).finally(() => setLoading(false));
  }, [apiFetch]);

  async function save() {
    setSaving(true); setPanelError(null);
    try {
      const updated = await apiFetch<typeof config>("/reminders/config", { method: "PUT", body: JSON.stringify(config) });
      setConfig(updated);
      setPanelSuccess("Erinnerungs-Konfiguration gespeichert.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
    setSaving(false);
  }

  async function runNow() {
    setRunning(true); setPanelError(null);
    try {
      const result = await apiFetch<{ results: string[] }>("/reminders/run", { method: "POST" });
      setPanelSuccess("Erinnerungen ausgefuehrt: " + result.results.join(", "));
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
    setRunning(false);
  }

  const toggle = (key: keyof typeof config) => setConfig((c) => ({ ...c, [key]: !c[key] }));

  if (loading) return <SectionCard title="Erinnerungen"><p className="text-sm text-slate-500">Laden...</p></SectionCard>;

  return (
    <div className="grid gap-6">
      <SectionCard title="Automatische Erinnerungen" subtitle="E-Mail- und In-App-Erinnerungen fuer offene Vorgaenge.">
        <div className="grid gap-3 md:max-w-2xl">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.enabled} onChange={() => toggle("enabled")} /> Erinnerungen aktiviert</label>
          <div className="ml-6 grid gap-2">
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.missingTime} onChange={() => toggle("missingTime")} disabled={!config.enabled} /> Fehlende Zeiten</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.openSignatures} onChange={() => toggle("openSignatures")} disabled={!config.enabled} /> Offene Signaturen</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.openApprovals} onChange={() => toggle("openApprovals")} disabled={!config.enabled} /> Offene Freigaben</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.projectStart} onChange={() => toggle("projectStart")} disabled={!config.enabled} /> Projektstart-Erinnerung</label>
          </div>
          <div className="mt-2 border-t border-black/10 pt-3 dark:border-white/10">
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.emailEnabled} onChange={() => toggle("emailEnabled")} disabled={!config.enabled} /> E-Mail-Versand aktiv (ueber SMTP)</label>
            <p className="ml-6 mt-1 text-xs text-slate-500">SMS und Push werden vorbereitet und sind in einer spaeteren Version verfuegbar.</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={saving} onClick={() => void save()}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {saving ? "Speichert..." : "Konfiguration speichern"}
            </button>
            <button type="button" onClick={() => void runNow()} disabled={running || !config.enabled}
              className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-slate-800">
              {running ? "Laeuft..." : "Jetzt ausfuehren"}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

