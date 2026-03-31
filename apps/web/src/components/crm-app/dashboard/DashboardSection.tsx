"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Summary, Customer, Project, Worker, TeamItem, TimesheetItem } from "../types";
import { cx, SectionCard, MiniStat } from "../shared";
import { DashboardList } from "./DashboardList";
import { useI18n } from "../../../i18n-context";
import { formatMinutes } from "../worker/format-minutes";

export function DashboardSection({
  summary,
  customers,
  projects,
  workers,
  teams,
}: {
  summary: Summary | null;
  customers: Customer[];
  projects: Project[];
  workers: Worker[];
  teams: TeamItem[];
}) {
  const { t: l, locale } = useI18n();
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick((prev) => prev + 1);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  function mapsUrl(latitude?: number | null, longitude?: number | null) {
    if (latitude == null || longitude == null) return null;
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }

  function workerStatus(w: Worker): { label: string; color: string } {
    const lastEntry = w.timeEntries?.[0];
    if (lastEntry?.entryType === "CLOCK_IN") {
      return { label: "arbeitet", color: "bg-emerald-500" };
    }
    const hasAssignment = (w.assignments ?? []).length > 0;
    if (hasAssignment) {
      return { label: "nicht gestartet", color: "bg-red-500" };
    }
    return { label: "kein Projekt", color: "bg-amber-500" };
  }

  function projectTeamHint(p: Project): string {
    const assignedWorkers = (p.assignments ?? []).map((a) => a.worker);
    if (assignedWorkers.length === 0) return "Keine Monteure zugeordnet";

    // Pruefen ob ein Team alle zugeordneten Monteure abdeckt
    const workerIds = new Set(assignedWorkers.map((w) => w.id));
    for (const team of teams) {
      const teamWorkerIds = new Set(team.members.map((m) => m.worker.id));
      if (workerIds.size > 0 && [...workerIds].every((id) => teamWorkerIds.has(id))) {
        return team.name;
      }
    }

    if (assignedWorkers.length <= 3) {
      return assignedWorkers.map((w) => `${w.firstName} ${w.lastName}`).join(", ");
    }
    return `${assignedWorkers.length} Monteure zugeordnet`;
  }

  function workerMeta(w: Worker) {
    const lastEntry = w.timeEntries?.[0];
    if (!lastEntry) {
      return null;
    }
    const occurredAt = new Date(lastEntry.occurredAtClient || lastEntry.occurredAtServer);
    const mapUrl = mapsUrl(lastEntry.latitude, lastEntry.longitude);
    if (lastEntry.entryType === "CLOCK_IN") {
      const minutesSince = Math.max(0, ((Date.now() + nowTick * 0) - occurredAt.getTime()) / 60000);
      return {
        timeLabel: l("dashboard.clockInAt"),
        timeValue: occurredAt.toLocaleString(locale),
        durationLabel: l("dashboard.workingSince"),
        durationValue: formatMinutes(minutesSince),
        mapUrl,
        projectLabel: lastEntry.project ? `${lastEntry.project.projectNumber} - ${lastEntry.project.title}` : null,
      };
    }
    return {
      timeLabel: l("dashboard.clockOutAt"),
      timeValue: occurredAt.toLocaleString(locale),
      durationLabel: null,
      durationValue: null,
      mapUrl,
      projectLabel: lastEntry.project ? `${lastEntry.project.projectNumber} - ${lastEntry.project.title}` : null,
    };
  }

  return (
    <div className="grid gap-6">
      {summary ? (
        <div className="grid gap-4 md:grid-cols-4">
          <MiniStat title="Kunden" value={summary.customers} />
          <MiniStat title="Projekte" value={summary.projects} />
          <MiniStat title="Monteure" value={summary.workers} />
          <MiniStat title="Offene Wochenzettel" value={summary.openTimesheets} />
        </div>
      ) : null}

      <SectionCard title="Kunden">
        <DashboardList
          items={customers}
          href={(item) => `/customers/${item.id}`}
          primary={(item) => item.companyName}
          secondary={(item) => item.customerNumber}
        />
      </SectionCard>

      <SectionCard title="Projekte">
        <div className="grid gap-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
            >
              <div>
                <div className="font-medium">{p.title}</div>
                <div className="text-sm text-slate-500">{p.projectNumber}</div>
              </div>
              <div className="text-right text-xs text-slate-500">{projectTeamHint(p)}</div>
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Monteure">
        <div className="grid gap-2">
          {workers.filter((w) => w.active !== false).map((w) => {
            const st = workerStatus(w);
            const meta = workerMeta(w);
            return (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <Link href={`/workers/${w.id}`} className="font-medium hover:underline">
                    {w.firstName} {w.lastName}
                  </Link>
                  <div className="text-sm text-slate-500">{w.workerNumber}</div>
                  {meta ? (
                    <div className="mt-2 grid gap-1 text-xs text-slate-500">
                      <div>{meta.timeLabel}: {meta.timeValue}</div>
                      {meta.projectLabel ? (
                        <div>{l("dashboard.currentProject")}: {meta.projectLabel}</div>
                      ) : null}
                      {meta.durationLabel && meta.durationValue ? (
                        <div>{meta.durationLabel}: {meta.durationValue}</div>
                      ) : null}
                      <div>
                        {meta.mapUrl ? (
                          <a
                            href={meta.mapUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {l("worker.map")}
                          </a>
                        ) : (
                          l("dashboard.noLocation")
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cx("inline-block h-2.5 w-2.5 rounded-full", st.color)} />
                  <span className="text-xs text-slate-500">{st.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

