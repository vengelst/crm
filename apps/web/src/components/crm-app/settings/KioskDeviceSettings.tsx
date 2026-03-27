"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import type { KioskDevice, DeviceBindingConfig, Worker, UserItem } from "../types";
import { cx, SectionCard, SecondaryButton, PrimaryButton, FormRow, Field, SelectField } from "../shared";

export function KioskDeviceSettings({ apiFetch, workers, users, setPanelSuccess, setPanelError }: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  workers: Worker[];
  users: UserItem[];
  setPanelSuccess: Dispatch<SetStateAction<string | null>>;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const [config, setConfig] = useState<DeviceBindingConfig>({ mode: "off", appliesTo: "both" });
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", notes: "", assignedWorkerId: "", assignedUserId: "" });
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  const loadData = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([
        apiFetch<DeviceBindingConfig>("/devices/config"),
        apiFetch<KioskDevice[]>("/devices"),
      ]);
      setConfig(c);
      setDevices(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function saveConfig() {
    setSaving(true);
    setPanelError(null);
    try {
      const updated = await apiFetch<DeviceBindingConfig>("/devices/config", {
        method: "PUT",
        body: JSON.stringify(config),
      });
      setConfig(updated);
      setPanelSuccess("Geraetebindung gespeichert.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
    setSaving(false);
  }

  function startEdit(d: KioskDevice) {
    setEditingId(d.id);
    setEditForm({
      displayName: d.displayName ?? "",
      notes: d.notes ?? "",
      assignedWorkerId: d.assignedWorkerId ?? "",
      assignedUserId: d.assignedUserId ?? "",
    });
  }

  async function saveDevice() {
    if (!editingId) return;
    setPanelError(null);
    try {
      await apiFetch(`/devices/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: editForm.displayName || null,
          notes: editForm.notes || null,
          assignedWorkerId: editForm.assignedWorkerId || null,
          assignedUserId: editForm.assignedUserId || null,
        }),
      });
      setEditingId(null);
      setPanelSuccess("Geraet aktualisiert.");
      await loadData();
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
  }

  async function toggleActive(d: KioskDevice) {
    setPanelError(null);
    try {
      await apiFetch(`/devices/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !d.active }),
      });
      setPanelSuccess(d.active ? "Geraet deaktiviert." : "Geraet freigegeben.");
      await loadData();
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
  }

  async function deleteDevice(id: string) {
    setPanelError(null);
    try {
      await apiFetch(`/devices/${id}`, { method: "DELETE" });
      setPanelSuccess("Geraet entfernt.");
      await loadData();
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
  }

  const filtered = devices.filter((d) => {
    if (filter === "active") return d.active;
    if (filter === "inactive") return !d.active;
    return true;
  });

  const activeWorkers = workers.filter((w) => w.active !== false);

  if (loading) return <SectionCard title="Kiosk-Geraete"><p className="text-sm text-slate-500">Laden...</p></SectionCard>;

  return (
    <div className="grid gap-6">
      <SectionCard title="Geraetebindung" subtitle="Kiosk-Logins und Zeitbuchungen optional an bekannte Geraete binden.">
        <div className="grid gap-4 md:max-w-2xl">
          <SelectField label="Modus" value={config.mode} onChange={(e) => setConfig((c) => ({ ...c, mode: e.target.value as DeviceBindingConfig["mode"] }))}
            options={[
              { value: "off", label: "Geraetebindung aus" },
              { value: "warn", label: "Unbekannte Geraete nur warnen" },
              { value: "enforce", label: "Nur freigegebene Geraete erlauben" },
            ]}
          />
          <SelectField label="Gilt fuer" value={config.appliesTo} onChange={(e) => setConfig((c) => ({ ...c, appliesTo: e.target.value as DeviceBindingConfig["appliesTo"] }))}
            options={[
              { value: "both", label: "Login und Zeitbuchung" },
              { value: "login", label: "Nur Login" },
              { value: "time", label: "Nur Zeitbuchung" },
            ]}
          />
          <button type="button" disabled={saving} onClick={() => void saveConfig()}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            {saving ? "Speichert ..." : "Konfiguration speichern"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Bekannte Geraete" subtitle={`${devices.length} Geraet(e) registriert, ${devices.filter((d) => d.active).length} freigegeben.`}>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={cx("rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                filter === f
                  ? "border-slate-900 bg-slate-900 !text-white dark:border-slate-300 dark:bg-slate-200 dark:!text-slate-950"
                  : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
              )}>
              {f === "all" ? "Alle" : f === "active" ? "Freigegeben" : "Nicht freigegeben"}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Geraete gefunden.</p>
        ) : (
          <div className="grid gap-3">
            {filtered.map((d) => (
              <div key={d.id} className="rounded-xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-900/60">
                {editingId === d.id ? (
                  <div className="grid gap-3">
                    <FormRow>
                      <Field label="Anzeigename" value={editForm.displayName} onChange={(e) => setEditForm((c) => ({ ...c, displayName: e.target.value }))} />
                    </FormRow>
                    <FormRow>
                      <SelectField label="Zugeordneter Monteur" value={editForm.assignedWorkerId} onChange={(e) => setEditForm((c) => ({ ...c, assignedWorkerId: e.target.value }))}
                        options={[{ value: "", label: "- Kein -" }, ...activeWorkers.map((w) => ({ value: w.id, label: `${w.firstName} ${w.lastName} (${w.workerNumber})` }))]}
                      />
                      <SelectField label="Zugeordneter Benutzer" value={editForm.assignedUserId} onChange={(e) => setEditForm((c) => ({ ...c, assignedUserId: e.target.value }))}
                        options={[{ value: "", label: "- Kein -" }, ...users.filter((u) => u.isActive).map((u) => ({ value: u.id, label: `${u.displayName} (${u.email})` }))]}
                      />
                    </FormRow>
                    <Field label="Notizen" value={editForm.notes} onChange={(e) => setEditForm((c) => ({ ...c, notes: e.target.value }))} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveDevice()}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">Speichern</button>
                      <SecondaryButton onClick={() => setEditingId(null)}>Abbrechen</SecondaryButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cx("inline-block h-2.5 w-2.5 rounded-full", d.active ? "bg-emerald-500" : "bg-slate-400")} />
                        <span className="font-medium">{d.displayName || d.deviceUuid.slice(0, 12) + "..."}</span>
                        <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", d.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400")}>
                          {d.active ? "Freigegeben" : "Nicht freigegeben"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                        {d.platform ? <span>Plattform: {d.platform}</span> : null}
                        {d.browser ? <span>Browser: {d.browser}</span> : null}
                        <span>Erstmals: {new Date(d.firstSeenAt).toLocaleDateString("de-DE")}</span>
                        <span>Zuletzt: {new Date(d.lastSeenAt).toLocaleString("de-DE")}</span>
                      </div>
                      {d.assignedWorker ? (
                        <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                          Monteur: {d.assignedWorker.firstName} {d.assignedWorker.lastName} ({d.assignedWorker.workerNumber})
                        </div>
                      ) : null}
                      {d.assignedUser ? (
                        <div className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                          Benutzer: {d.assignedUser.displayName} ({d.assignedUser.email})
                        </div>
                      ) : null}
                      {d.notes ? <div className="mt-1 text-xs text-slate-400 italic">{d.notes}</div> : null}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <SecondaryButton onClick={() => startEdit(d)}>Bearbeiten</SecondaryButton>
                      <SecondaryButton onClick={() => void toggleActive(d)}>
                        {d.active ? "Sperren" : "Freigeben"}
                      </SecondaryButton>
                      <button type="button" onClick={() => void deleteDevice(d.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20">
                        Entfernen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

