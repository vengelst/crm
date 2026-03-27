"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ThemeToggle } from "../../theme-toggle";
import { t, type SupportedLang } from "../../../i18n";
import type { AuthState, Project, TimesheetItem, WorkerTimeStatus } from "../types";
import { cx, SectionCard, SecondaryButton, MessageBar } from "../shared";
import { TodayStatsBar } from "./TodayStatsBar";
import { OpenWorkCard } from "./OpenWorkCard";
import { WorkerTimesheetSection } from "./WorkerTimesheetSection";
import { getDeviceUuid } from "./device-uuid";

/** Props fuer die Kiosk-Projektdetail-Ansicht, die per Render-Prop eingebunden wird. */
export type KioskProjectViewProps = {
  project: Project;
  timesheets: TimesheetItem[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  workerId: string;
  authToken: string;
  lang?: SupportedLang;
};

export type WorkerTimeViewProps = {
  auth: AuthState;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onLogout: () => void;
  deviceWarning: string | null;
  setDeviceWarning: Dispatch<SetStateAction<string | null>>;
  /** Render-Prop: rendert die Kiosk-Projektdetailansicht. Entkoppelt WorkerTimeView von der konkreten Implementierung. */
  renderKioskProjectView: (props: KioskProjectViewProps) => React.ReactNode;
};

export function WorkerTimeView({
  auth,
  apiFetch,
  onLogout,
  deviceWarning,
  setDeviceWarning,
  renderKioskProjectView,
}: WorkerTimeViewProps) {
  const lang: SupportedLang = auth.sessionLang === "en" ? "en" : "de";
  const l = (key: string) => t(key, lang);

  const [status, setStatus] = useState<WorkerTimeStatus | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [workerSuccess, setWorkerSuccess] = useState<string | null>(null);

  const workerId = auth.worker?.id ?? auth.user.id;
  const currentProjects = auth.currentProjects ?? [];
  const futureProjects = auth.futureProjects ?? [];
  const pastProjects = auth.pastProjects ?? [];
  const hasOnlyFuture = currentProjects.length === 0 && futureProjects.length > 0;

  const loadStatus = useCallback(async () => {
    try {
      const s = await apiFetch<WorkerTimeStatus>(`/time/status?workerId=${workerId}`);
      setStatus(s);
    } catch {
      setStatus({ hasOpenWork: false, openEntry: null });
    }
  }, [apiFetch, workerId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  type LocationResult = { latitude?: number; longitude?: number; accuracy?: number; locationSource: string };

  const lastKnownRef = useRef<{ latitude: number; longitude: number; accuracy?: number; timestamp: number } | null>(null);
  const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

  function getLocation(projectId?: string): Promise<LocationResult> {
    return new Promise((resolve) => {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lastKnownRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: Date.now() };
            resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, locationSource: "live" });
          },
          () => resolve(getLastKnownOrFallback(projectId)),
          { timeout: 8000, enableHighAccuracy: true },
        );
        return;
      }
      resolve(getLastKnownOrFallback(projectId));
    });
  }

  function getLastKnownOrFallback(projectId?: string): LocationResult {
    const lk = lastKnownRef.current;
    if (lk && Date.now() - lk.timestamp < LAST_KNOWN_MAX_AGE_MS) {
      return { latitude: lk.latitude, longitude: lk.longitude, accuracy: lk.accuracy, locationSource: "last_known" };
    }
    return getProjectFallback(projectId);
  }

  function getProjectFallback(projectId?: string): LocationResult {
    if (projectId) {
      const project = currentProjects.find((p) => p.id === projectId);
      if (project?.siteLatitude != null && project?.siteLongitude != null) {
        return { latitude: project.siteLatitude, longitude: project.siteLongitude, locationSource: "project_fallback" };
      }
    }
    return { locationSource: "none" };
  }

  async function handleClockIn() {
    if (!selectedProjectId) { setWorkerError(l("worker.selectProject")); return; }
    setWorking(true); setWorkerError(null); setWorkerSuccess(null);
    try {
      const loc = await getLocation(selectedProjectId);
      const result = await apiFetch<{ deviceWarning?: string | null }>("/time/clock-in", {
        method: "POST",
        body: JSON.stringify({ workerId, projectId: selectedProjectId, latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, locationSource: loc.locationSource, sourceDevice: "web", deviceUuid: getDeviceUuid() }),
      });
      if (result.deviceWarning) setDeviceWarning(result.deviceWarning);
      setWorkerSuccess(l("worker.started"));
      setSelectedProjectId("");
      await loadStatus();
    } catch (err) { setWorkerError(err instanceof Error ? err.message : l("worker.errorStart")); }
    finally { setWorking(false); }
  }

  async function handleClockOut() {
    if (!status?.openEntry) return;
    setWorking(true); setWorkerError(null); setWorkerSuccess(null);
    try {
      const loc = await getLocation(status.openEntry.projectId);
      const result = await apiFetch<{ deviceWarning?: string | null }>("/time/clock-out", {
        method: "POST",
        body: JSON.stringify({ workerId, projectId: status.openEntry.projectId, latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, locationSource: loc.locationSource, sourceDevice: "web", deviceUuid: getDeviceUuid() }),
      });
      if (result.deviceWarning) setDeviceWarning(result.deviceWarning);
      setWorkerSuccess(l("worker.stopped"));
      await loadStatus();
    } catch (err) { setWorkerError(err instanceof Error ? err.message : l("worker.errorStop")); }
    finally { setWorking(false); }
  }

  const openWork = status?.openEntry;
  const allProjects = [...currentProjects, ...futureProjects];
  const viewingProject = viewingProjectId ? allProjects.find((p) => p.id === viewingProjectId) ?? null : null;
  const [kioskProjectDetail, setKioskProjectDetail] = useState<Project | null>(null);
  const [kioskTimesheets, setKioskTimesheets] = useState<TimesheetItem[]>([]);

  useEffect(() => {
    if (!viewingProjectId) { setKioskProjectDetail(null); setKioskTimesheets([]); return; }
    void apiFetch<Project>(`/projects/${viewingProjectId}`).then(setKioskProjectDetail).catch(() => {});
    void apiFetch<TimesheetItem[]>(`/timesheets/weekly?projectId=${viewingProjectId}`).then(setKioskTimesheets).catch(() => {});
  }, [apiFetch, viewingProjectId]);

  if (viewingProject && kioskProjectDetail) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={() => setViewingProjectId(null)}>{l("worker.back")}</SecondaryButton>
            <h2 className="text-xl font-semibold">{l("worker.projectDetail")}</h2>
          </div>
          {openWork && openWork.projectId === viewingProject.id ? (
            <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/5">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{l("worker.currentWorkOnProject")}</div>
              <div className="mt-1 text-sm">{l("worker.startedAt")} <span className="font-mono">{new Date(openWork.startedAt).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}</span></div>
            </div>
          ) : null}
          {renderKioskProjectView({ project: kioskProjectDetail, timesheets: kioskTimesheets, apiFetch, workerId, authToken: auth.accessToken, lang })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-200">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{l("worker.platform")}</p>
            <h1 className="text-2xl font-semibold">{l("worker.timeTracking")}</h1>
            <p className="text-sm text-slate-500">{auth.worker?.name} · {auth.worker?.workerNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SecondaryButton onClick={onLogout}>{l("worker.logout")}</SecondaryButton>
          </div>
        </div>

        <MessageBar error={workerError} success={workerSuccess} />

        {deviceWarning ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="flex-1">
              <span>{deviceWarning}</span>
              <button type="button" onClick={() => setDeviceWarning(null)} className="ml-2 text-xs underline opacity-70 hover:opacity-100">{l("worker.hide")}</button>
            </div>
          </div>
        ) : null}

        {status?.todayStats && status.todayStats.totalMinutes > 0 ? <TodayStatsBar stats={status.todayStats} lang={lang} /> : null}

        {openWork ? <OpenWorkCard openWork={openWork} working={working} onClockOut={() => void handleClockOut()} onOpenProject={() => setViewingProjectId(openWork.projectId)} lang={lang} /> : null}

        {!openWork && status !== null ? (
          <>
            {hasOnlyFuture ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/5">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{l("worker.noActiveProject")}</p>
              </div>
            ) : null}
            {currentProjects.length > 0 ? (
              <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                <h2 className="mb-4 text-lg font-semibold">{l("worker.startWork")}</h2>
                <div className="grid gap-3">
                  {currentProjects.map((p) => (
                    <div key={p.id} onClick={() => setSelectedProjectId(p.id)}
                      className={cx("flex cursor-pointer items-center justify-between rounded-xl border p-4 transition", selectedProjectId === p.id ? "border-slate-900 bg-slate-900/5 ring-2 ring-slate-900/20 dark:border-slate-100 dark:bg-slate-100/5 dark:ring-slate-100/20" : "border-black/10 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800")}>
                      <div className="flex items-center gap-3">
                        <div className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", selectedProjectId === p.id ? "border-slate-900 dark:border-slate-100" : "border-slate-300 dark:border-slate-600")}>
                          {selectedProjectId === p.id ? <div className="h-2.5 w-2.5 rounded-full bg-slate-900 dark:bg-slate-100" /> : null}
                        </div>
                        <div>
                          <div className="font-medium">{p.title}</div>
                          <div className="text-sm text-slate-500">{p.projectNumber}{p.customerName ? ` · ${p.customerName}` : ""}</div>
                        </div>
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setViewingProjectId(p.id); }}
                        className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                        {l("worker.openProject")}
                      </button>
                    </div>
                  ))}
                  <button type="button" disabled={working || !selectedProjectId} onClick={() => void handleClockIn()}
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60">
                    {working ? l("worker.starting") : l("worker.startWork")}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {status === null ? <div className="text-center text-sm text-slate-500">{l("worker.loadingStatus")}</div> : null}

        {currentProjects.length > 0 && status !== null ? <WorkerTimesheetSection workerId={workerId} projects={currentProjects} apiFetch={apiFetch} /> : null}

        {futureProjects.length > 0 ? (
          <SectionCard title={l("worker.futureProjects")}>
            <div className="grid gap-3">
              {futureProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-4 dark:border-white/10">
                  <div>
                    <div className="font-semibold">{p.title}</div>
                    <p className="text-sm text-slate-500">{p.projectNumber} · {p.customerName ?? ""} · {l("worker.from")} {p.startDate.slice(0, 10)}</p>
                  </div>
                  <button type="button" onClick={() => setViewingProjectId(p.id)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
                    {l("worker.openProject")}
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {pastProjects.length > 0 ? (
          <SectionCard title={l("worker.pastProjects")}>
            <div className="grid gap-3">
              {pastProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl border border-black/5 p-4 text-slate-500 dark:border-white/5">
                  <div>
                    <div className="font-medium">{p.title}</div>
                    <p className="text-sm">{p.projectNumber} · {p.customerName ?? ""} · {p.startDate.slice(0, 10)} {l("worker.to")} {p.endDate?.slice(0, 10) ?? l("worker.open")}</p>
                  </div>
                  <button type="button" onClick={() => setViewingProjectId(p.id)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-400">
                    {l("worker.openProject")}
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
