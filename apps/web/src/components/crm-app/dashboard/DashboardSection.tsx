"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Summary, Customer, OfficeReminderItem, Project, Worker, TeamItem, TimesheetItem } from "../types";
import { cx, MessageBar, SectionCard, MiniStat } from "../shared";
import { DashboardList } from "./DashboardList";
import { useI18n } from "../../../i18n-context";
import { formatMinutes } from "../worker/format-minutes";

export function DashboardSection({
  summary,
  customers,
  projects,
  workers,
  teams,
  apiFetch,
}: {
  summary: Summary | null;
  customers: Customer[];
  projects: Project[];
  workers: Worker[];
  teams: TeamItem[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const { t: l, locale } = useI18n();
  const [nowTick, setNowTick] = useState(0);
  const [reminders, setReminders] = useState<OfficeReminderItem[]>([]);
  const [completingReminderId, setCompletingReminderId] = useState<string | null>(null);
  const [reminderActionError, setReminderActionError] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick((prev) => prev + 1);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void apiFetch<OfficeReminderItem[]>("/reminders/items?status=OPEN")
      .then((data) => setReminders(data))
      .catch(() => setReminders([]));
  }, [apiFetch]);

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

  function reminderState(item: OfficeReminderItem) {
    const dueBase = new Date(item.dueAt || item.remindAt);
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setHours(23, 59, 59, 999);
    if (dueBase < startToday) return l("settings.remindersTimeOverdue");
    if (dueBase <= endToday) return l("settings.remindersTimeToday");
    return l("settings.remindersTimeWeek");
  }

  async function completeReminder(id: string) {
    setCompletingReminderId(id);
    setReminderActionError(null);
    try {
      await apiFetch(`/reminders/items/${id}/complete`, { method: "POST" });
      setReminders((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setReminderActionError(error instanceof Error ? error.message : l("common.error"));
    } finally {
      setCompletingReminderId(null);
    }
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
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span>{meta.durationLabel}:</span>
                          <span className="rounded-lg bg-emerald-100 px-3 py-1 text-base font-extrabold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            {meta.durationValue}
                          </span>
                        </div>
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

      <SectionCard title={l("dashboard.remindersTitle")}>
        <MessageBar error={reminderActionError} success={null} />
        {reminders.length === 0 ? (
          <p className="text-sm text-slate-500">{l("dashboard.remindersEmpty")}</p>
        ) : (
          <div className="grid gap-2">
            {reminders.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <Link
                  href={`/settings?tab=reminders&itemId=${encodeURIComponent(item.id)}`}
                  className="min-w-0 flex-1"
                >
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-slate-500">
                    {item.assignedUser.displayName} · {new Date(item.remindAt).toLocaleString(locale)}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cx(
                    "rounded-full px-2 py-1 text-xs font-semibold",
                    reminderState(item) === l("settings.remindersTimeOverdue")
                      ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                      : reminderState(item) === l("settings.remindersTimeToday")
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
                  )}>
                    {reminderState(item)}
                  </span>
                  <button
                    type="button"
                    disabled={completingReminderId === item.id}
                    onClick={() => void completeReminder(item.id)}
                    className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                  >
                    {completingReminderId === item.id ? "..." : l("settings.remindersMarkDone")}
                  </button>
                </div>
              </div>
            ))}
            <Link href="/settings?tab=reminders" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
              {l("dashboard.remindersOpenAll")}
            </Link>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

