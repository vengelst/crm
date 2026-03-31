"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { ThemeToggle } from "../../theme-toggle";
import type { AuthState, Project } from "../types";
import { t, type SupportedLang } from "../../../i18n";
import { cx, SectionCard, SecondaryButton } from "../shared";

export function KioskUserView({
  auth,
  apiFetch,
  onLogout,
  deviceWarning,
  setDeviceWarning,
}: {
  auth: AuthState;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onLogout: () => void;
  deviceWarning: string | null;
  setDeviceWarning: Dispatch<SetStateAction<string | null>>;
}) {
  const lang: SupportedLang = auth.sessionLang === "en" ? "en" : "de";
  const l = (key: string) => t(key, lang);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<Project[]>("/projects")
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{l("kiosk.subtitle")}</p>
            <h1 className="text-xl font-semibold">{auth.user.displayName}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{auth.user.roles.join(", ")}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SecondaryButton onClick={() => onLogout()}>{l("worker.logout")}</SecondaryButton>
          </div>
        </div>

        {deviceWarning ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="flex-1">
              <span>{deviceWarning}</span>
              <button type="button" onClick={() => setDeviceWarning(null)} className="ml-2 text-xs underline opacity-70 hover:opacity-100">{l("worker.hide")}</button>
            </div>
          </div>
        ) : null}

        <SectionCard title={l("kiosk.projects")} subtitle={loading ? l("common.loading") : `${projects.length} ${l("kiosk.projectCount")}`}>
          {projects.length === 0 && !loading ? (
            <p className="text-sm text-slate-500">{l("kiosk.noProjects")}</p>
          ) : (
            <div className="grid gap-3">
              {projects.map((p) => (
                <div key={p.id} className="rounded-xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{p.projectNumber} - {p.title}</div>
                      {p.customer ? <div className="mt-0.5 text-sm text-slate-500">{l("kiosk.customer")} {p.customer.companyName}</div> : null}
                      {p.siteCity ? <div className="text-sm text-slate-500">{l("kiosk.location")} {[p.siteAddressLine1, p.sitePostalCode, p.siteCity].filter(Boolean).join(", ")}</div> : null}
                    </div>
                    <span className={cx("shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase",
                      p.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    )}>{p.status}</span>
                  </div>
                  {p.plannedStartDate || p.plannedEndDate ? (
                    <div className="mt-2 text-xs text-slate-500">
                      {l("kiosk.period")} {p.plannedStartDate?.slice(0, 10) ?? "?"} - {p.plannedEndDate?.slice(0, 10) ?? l("worker.open")}
                    </div>
                  ) : null}
                  {p.assignments && p.assignments.length > 0 ? (
                    <div className="mt-2 text-xs text-slate-500">
                      {l("kiosk.technicians")} {p.assignments.map((a) => `${a.worker.firstName} ${a.worker.lastName}`).join(", ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// WorkerTimeView is now in ./crm-app/worker/WorkerTimeView.tsx


// CompanySettingsTab, BackupSettingsTab, GoogleCalendarSettings → ./crm-app/settings/

