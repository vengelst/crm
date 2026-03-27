"use client";

import Link from "next/link";
import type { Summary, Customer, Project, Worker, TeamItem, TimesheetItem } from "../types";
import { cx, SectionCard, MiniStat } from "../shared";
import { DashboardList } from "./DashboardList";

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
            return (
              <Link
                key={w.id}
                href={`/workers/${w.id}`}
                className="flex items-center justify-between rounded-2xl border border-black/10 px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div>
                  <div className="font-medium">{w.firstName} {w.lastName}</div>
                  <div className="text-sm text-slate-500">{w.workerNumber}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cx("inline-block h-2.5 w-2.5 rounded-full", st.color)} />
                  <span className="text-xs text-slate-500">{st.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

