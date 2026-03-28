"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { useI18n } from "../../../i18n-context";
import { SectionCard, SecondaryButton } from "../shared";

export function ReminderSettings({ apiFetch, setPanelSuccess, setPanelError }: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: Dispatch<SetStateAction<string | null>>;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const { t: l } = useI18n();
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
      setPanelSuccess(l("common.success"));
    } catch (e) { setPanelError(e instanceof Error ? e.message : l("common.error")); }
    setSaving(false);
  }

  async function runNow() {
    setRunning(true); setPanelError(null);
    try {
      const result = await apiFetch<{ results: string[] }>("/reminders/run", { method: "POST" });
      setPanelSuccess(l("settings.remindersRanMsg") + result.results.join(", "));
    } catch (e) { setPanelError(e instanceof Error ? e.message : l("common.error")); }
    setRunning(false);
  }

  const toggle = (key: keyof typeof config) => setConfig((c) => ({ ...c, [key]: !c[key] }));

  if (loading) return <SectionCard title={l("settings.reminders")}><p className="text-sm text-slate-500">{l("common.loading")}</p></SectionCard>;

  return (
    <div className="grid gap-6">
      <SectionCard title={l("settings.reminders")} subtitle={l("settings.remindersSub")}>
        <div className="grid gap-3 md:max-w-2xl">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.enabled} onChange={() => toggle("enabled")} /> {l("settings.remindersEnabled")}</label>
          <div className="ml-6 grid gap-2">
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.missingTime} onChange={() => toggle("missingTime")} disabled={!config.enabled} /> {l("settings.remindersMissingTime")}</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.openSignatures} onChange={() => toggle("openSignatures")} disabled={!config.enabled} /> {l("settings.remindersOpenSig")}</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.openApprovals} onChange={() => toggle("openApprovals")} disabled={!config.enabled} /> {l("settings.remindersOpenApproval")}</label>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.projectStart} onChange={() => toggle("projectStart")} disabled={!config.enabled} /> {l("settings.remindersProjectStart")}</label>
          </div>
          <div className="mt-2 border-t border-black/10 pt-3 dark:border-white/10">
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.emailEnabled} onChange={() => toggle("emailEnabled")} disabled={!config.enabled} /> {l("settings.remindersEmailEnabled")}</label>
            <p className="ml-6 mt-1 text-xs text-slate-500">{l("settings.remindersSmsNote")}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={saving} onClick={() => void save()}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              {saving ? l("common.saving") : l("settings.remindersSaveConfig")}
            </button>
            <button type="button" onClick={() => void runNow()} disabled={running || !config.enabled}
              className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-slate-800">
              {running ? l("settings.remindersRunning") : l("settings.remindersRun")}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

