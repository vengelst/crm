"use client";

import { useRef, useState } from "react";
import type { Project, Worker, TeamItem } from "../types";
import { cx, SectionCard, SecondaryButton, MessageBar, FormRow, Field, SelectField } from "../shared";
import { useI18n } from "../../../i18n-context";

export function PlanningCalendar({ projects, workers, teams, apiFetch, onDataChanged }: { projects: Project[]; workers: Worker[]; teams: TeamItem[]; apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>; onDataChanged: () => void }) {
  const { t: l, locale } = useI18n();
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [planForm, setPlanForm] = useState({ projectId: "", startDate: "", endDate: "", teamId: "", workerIds: [] as string[] });
  const [, setPlanConflicts] = useState<string[]>([]);
  const [planSaving, setPlanSaving] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const wheelLockUntilRef = useRef(0);

  function openPlanForm(p: Project) {
    const focusDate = p.plannedStartDate ?? p.plannedEndDate;
    if (focusDate) {
      const date = new Date(focusDate);
      setViewMonth(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    setPlanForm({
      projectId: p.id,
      startDate: p.plannedStartDate?.slice(0, 10) ?? "",
      endDate: p.plannedEndDate?.slice(0, 10) ?? "",
      teamId: "",
      workerIds: (p.assignments ?? []).map((a) => a.worker.id),
    });
    setPlanConflicts([]);
    setPlanMsg(null);
    setPlanErr(null);
    setSelectedDay(null);
    setSelectedProject(p);
  }

  function changeMonth(direction: -1 | 1) {
    const d = new Date(year, month - 1 + direction, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function checkConflicts() {
    if (!planForm.startDate) return [];
    const start = new Date(planForm.startDate);
    const end = planForm.endDate ? new Date(planForm.endDate) : null;
    const issues: string[] = [];
    for (const wid of planForm.workerIds) {
      const w = workers.find((x) => x.id === wid);
      if (!w) continue;
      for (const p of projects) {
        if (p.id === planForm.projectId) continue;
        if (!(p.assignments ?? []).some((a) => a.worker.id === wid)) continue;
        if (!p.plannedStartDate) continue;
        const pStart = new Date(p.plannedStartDate);
        const pEnd = p.plannedEndDate ? new Date(p.plannedEndDate) : null;
        const overlap = start <= (pEnd ?? new Date("9999-12-31")) && (end ?? new Date("9999-12-31")) >= pStart;
        if (overlap) {
          issues.push(`${w.firstName} ${w.lastName} ${l("plan.conflictsWith")} ${p.projectNumber} (${p.plannedStartDate.slice(0, 10)} - ${p.plannedEndDate?.slice(0, 10) ?? l("worker.open")})`);
        }
      }
    }
    return issues;
  }

  async function savePlan() {
    const conflicts = checkConflicts();
    setPlanConflicts(conflicts);
    if (conflicts.length > 0 && !window.confirm(l("plan.conflicts").replace("{count}", String(conflicts.length)))) return;
    setPlanSaving(true); setPlanErr(null); setPlanMsg(null);
    try {
      // 1. Zeitraum speichern
      await apiFetch(`/projects/${planForm.projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          plannedStartDate: planForm.startDate || undefined,
          plannedEndDate: planForm.endDate || undefined,
        }),
      });
      // 2. Monteur-Zuordnungen ersetzen (auch bei leerem Array = alle entfernen)
      if (planForm.startDate) {
        await apiFetch(`/projects/${planForm.projectId}/assignments`, {
          method: "PUT",
          body: JSON.stringify({
            workerIds: planForm.workerIds,
            startDate: planForm.startDate,
            endDate: planForm.endDate || undefined,
          }),
        });
      }
      setPlanMsg("Planung und Monteur-Zuordnungen gespeichert.");
      onDataChanged();
      // Formular mit den tatsaechlich gespeicherten Daten aktualisieren
      setPlanForm((c) => ({ ...c, workerIds: [...planForm.workerIds] }));
      setSelectedProject(null);
    } catch (e) { setPlanErr(e instanceof Error ? e.message : l("plan.saveError")); }
    finally { setPlanSaving(false); }
  }

  // Drag-Zustand fuer Kalender (Verschieben/Resize bestehender)
  const [dragState, setDragState] = useState<{ projectId: string; startDay: number; currentDay: number; mode: "move" | "resize-end" } | null>(null);

  // Aufziehen neuer Termine auf leeren Tagen
  const [drawState, setDrawState] = useState<{ startDay: number; currentDay: number } | null>(null);
  const [drawProjectPicker, setDrawProjectPicker] = useState<{ startDay: number; endDay: number } | null>(null);

  function handleDragStart(projectId: string, day: number, mode: "move" | "resize-end") {
    setDragState({ projectId, startDay: day, currentDay: day, mode });
  }

  function handleDragOver(day: number) {
    if (dragState) setDragState((s) => s ? { ...s, currentDay: day } : null);
  }

  async function handleDragEnd() {
    if (!dragState) return;
    const p = projects.find((x) => x.id === dragState.projectId);
    if (!p) { setDragState(null); return; }

    const delta = dragState.currentDay - dragState.startDay;
    if (delta === 0) { setDragState(null); return; }

    let newStart = p.plannedStartDate ? new Date(p.plannedStartDate) : new Date(year, month - 1, dragState.startDay);
    let newEnd = p.plannedEndDate ? new Date(p.plannedEndDate) : null;

    if (dragState.mode === "move") {
      newStart = new Date(newStart.getTime() + delta * 86400000);
      if (newEnd) newEnd = new Date(newEnd.getTime() + delta * 86400000);
    } else {
      // resize-end
      if (newEnd) {
        newEnd = new Date(newEnd.getTime() + delta * 86400000);
      } else {
        newEnd = new Date(newStart.getTime() + delta * 86400000);
      }
      if (newEnd < newStart) newEnd = newStart;
    }

    setDragState(null);
    try {
      await apiFetch(`/projects/${dragState.projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          plannedStartDate: newStart.toISOString().slice(0, 10),
          plannedEndDate: newEnd?.toISOString().slice(0, 10) ?? undefined,
        }),
      });
      onDataChanged();
    } catch { /* silently fail */ }
  }

  function applyTeam(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      setPlanForm((c) => ({ ...c, teamId, workerIds: team.members.map((m) => m.worker.id) }));
    }
  }

  const year = Number(viewMonth.slice(0, 4));
  const month = Number(viewMonth.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mo=0

  // Projekte mit Zeitraum
  const plannable = projects.filter((p) => p.plannedStartDate || p.plannedEndDate);

  function projectInDay(p: Project, day: number) {
    const date = new Date(year, month - 1, day);
    const start = p.plannedStartDate ? new Date(p.plannedStartDate) : null;
    const end = p.plannedEndDate ? new Date(p.plannedEndDate) : null;
    if (start && date < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;
    if (end && date > new Date(end.getFullYear(), end.getMonth(), end.getDate())) return false;
    if (!start && !end) return false;
    return true;
  }

  // Konflikte: Monteure die an mehreren Projekten gleichzeitig zugeordnet sind
  function getConflicts() {
    const conflicts: { day: number; workerName: string; projects: string[] }[] = [];
    const activeWorkers = workers.filter((w) => w.active !== false);
    for (let day = 1; day <= daysInMonth; day++) {
      const dayProjects = plannable.filter((p) => projectInDay(p, day));
      for (const w of activeWorkers) {
        const workerProjects = dayProjects.filter((p) =>
          (p.assignments ?? []).some((a) => a.worker.id === w.id),
        );
        if (workerProjects.length > 1) {
          conflicts.push({
            day,
            workerName: `${w.firstName} ${w.lastName}`,
            projects: workerProjects.map((p) => p.projectNumber),
          });
        }
      }
    }
    return conflicts;
  }

  const conflicts = getConflicts();
  const conflictDays = new Set(conflicts.map((c) => c.day));
  const selectedDayProjects = selectedDay ? plannable.filter((p) => projectInDay(p, selectedDay)) : [];

  const statusColor = (s?: string) => {
    switch (s) {
      case "ACTIVE": return "bg-emerald-200 dark:bg-emerald-800";
      case "PLANNED": return "bg-blue-200 dark:bg-blue-800";
      case "PAUSED": return "bg-amber-200 dark:bg-amber-800";
      default: return "bg-slate-200 dark:bg-slate-700";
    }
  };

  return (
    <div className="grid gap-6">
      {/* Monatsnavigation */}
      <div className="flex items-center gap-4">
        <SecondaryButton onClick={() => changeMonth(-1)}>&#8592;</SecondaryButton>
        <h2 className="text-xl font-semibold">{new Date(year, month - 1).toLocaleDateString(locale, { month: "long", year: "numeric" })}</h2>
        <SecondaryButton onClick={() => changeMonth(1)}>&#8594;</SecondaryButton>
      </div>

      {/* Projekt einplanen */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-xs font-medium text-slate-500">{l("plan.selectProject")}</label>
          <select onChange={(e) => { const p = projects.find((x) => x.id === e.target.value); if (p) openPlanForm(p); e.target.value = ""; }}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900">
            <option value="">{l("plan.selectProjectPlaceholder")}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.projectNumber} – {p.title}</option>)}
          </select>
        </div>
      </div>

      {/* Konflikte */}
      {conflicts.length > 0 ? (
        <div className="rounded-2xl border border-red-300 bg-red-50/60 p-4 dark:border-red-500/40 dark:bg-red-500/5">
          <h3 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">{l("plan.conflictsTitle")}</h3>
          {conflicts.map((c, i) => (
            <div key={i} className="text-xs text-red-600 dark:text-red-300">
              Tag {c.day}: {c.workerName} in {c.projects.join(" + ")}
            </div>
          ))}
        </div>
      ) : null}

      {/* Kalender-Grid mit Drag-Support */}
      <div className="rounded-3xl border border-black/10 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80"
        onWheel={(event) => {
          event.preventDefault();
          const now = Date.now();
          if (now < wheelLockUntilRef.current || event.deltaY === 0) {
            return;
          }
          wheelLockUntilRef.current = now + 250;
          changeMonth(event.deltaY > 0 ? 1 : -1);
        }}
        onPointerUp={() => {
          if (dragState) { void handleDragEnd(); return; }
          if (drawState) {
            const s = Math.min(drawState.startDay, drawState.currentDay);
            const e = Math.max(drawState.startDay, drawState.currentDay);
            setDrawState(null);
            if (s !== e) setDrawProjectPicker({ startDay: s, endDay: e });
          }
        }}>
        <div className="grid grid-cols-7 gap-px select-none">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-slate-500">{d}</div>
          ))}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] rounded-lg bg-slate-50/50 dark:bg-slate-950/20" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayProjects = plannable.filter((p) => projectInDay(p, day));
            const hasConflict = conflictDays.has(day);
            const isWeekend = ((firstDayOfWeek + i) % 7) >= 5;
            const isDragOver = dragState && dragState.currentDay === day;
            const isSelectedDay = selectedDay === day;
            return (
              <div key={day}
                onClick={() => setSelectedDay(day)}
                onPointerEnter={() => { handleDragOver(day); if (drawState) setDrawState((s) => s ? { ...s, currentDay: day } : null); }}
                onPointerDown={(e) => { if (dayProjects.length === 0 && !dragState) { e.preventDefault(); setDrawState({ startDay: day, currentDay: day }); } }}
                className={cx(
                  "min-h-[80px] rounded-lg border p-1 transition-colors",
                  (drawState && day >= Math.min(drawState.startDay, drawState.currentDay) && day <= Math.max(drawState.startDay, drawState.currentDay)) ? "border-blue-400 bg-blue-100/50 dark:border-blue-500/50 dark:bg-blue-500/15" :
                  isDragOver ? "border-blue-400 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-500/10" :
                  isSelectedDay ? "border-sky-400 bg-sky-50/70 dark:border-sky-500/50 dark:bg-sky-500/10" :
                  hasConflict ? "border-red-300 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/5" :
                  isWeekend ? "border-black/5 bg-slate-50/30 dark:border-white/5 dark:bg-slate-950/30" :
                  "border-black/5 dark:border-white/5",
                )}>
                <div className="mb-1 text-right text-xs font-medium text-slate-400">{day}</div>
                {dayProjects.slice(0, 3).map((p) => (
                  <div key={p.id} className={cx("group relative mb-0.5 flex w-full items-center rounded text-left text-[10px] font-medium", statusColor(p.status))}>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); openPlanForm(p); }}
                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDragStart(p.id, day, "move"); }}
                      className="flex-1 px-1 py-0.5 text-left leading-tight cursor-grab active:cursor-grabbing">
                      <span className="line-clamp-2 break-words">{p.projectNumber} - {p.title}</span>
                    </button>
                    <button type="button"
                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDragStart(p.id, day, "resize-end"); }}
                      className="hidden w-2 cursor-ew-resize rounded-r bg-black/10 group-hover:block dark:bg-white/20"
                      title={l("plan.adjustEnd")}>&nbsp;</button>
                  </div>
                ))}
                {dayProjects.length > 3 ? <div className="text-[9px] text-slate-400">+{dayProjects.length - 3}</div> : null}
              </div>
            );
          })}
        </div>
        {dragState ? <div className="mt-2 text-center text-xs text-blue-600 dark:text-blue-400">
          {dragState.mode === "move" ? l("plan.moving") : l("plan.adjustEnd")}: Tag {dragState.startDay} → {dragState.currentDay} ({dragState.currentDay - dragState.startDay > 0 ? "+" : ""}{dragState.currentDay - dragState.startDay} Tage)
        </div> : null}
        {drawState ? <div className="mt-2 text-center text-xs text-blue-600 dark:text-blue-400">
          {l("plan.newDate")} Tag {Math.min(drawState.startDay, drawState.currentDay)} – {Math.max(drawState.startDay, drawState.currentDay)}
        </div> : null}
      </div>

      {selectedDay ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{l("plan.dayDetails")}</h3>
                <p className="text-sm text-slate-500">
                  {new Date(year, month - 1, selectedDay).toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
              <SecondaryButton onClick={() => setSelectedDay(null)}>{l("common.close")}</SecondaryButton>
            </div>
            {selectedDayProjects.length === 0 ? (
              <p className="text-sm text-slate-500">{l("plan.noProjectsForDay")}</p>
            ) : (
              <div className="grid gap-3">
                {selectedDayProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openPlanForm(project)}
                    className="rounded-xl border border-black/10 bg-white/70 p-3 text-left transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:hover:bg-slate-800/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {project.projectNumber}
                          </span>
                          <div className="font-semibold">{project.title}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            {l("table.customer")}: {project.customer?.companyName ?? "-"}
                          </span>
                          <span className={cx("rounded-full px-2 py-0.5 font-medium", statusColor(project.status))}>
                            {l("table.status")}: {project.status ?? "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500">
                      <div className="grid gap-1">
                        <div className="font-medium text-slate-600 dark:text-slate-300">{l("table.period")}</div>
                        <div>{project.plannedStartDate?.slice(0, 10) ?? "-"} - {project.plannedEndDate?.slice(0, 10) ?? l("worker.open")}</div>
                      </div>
                      <div className="grid gap-1">
                        <div className="font-medium text-slate-600 dark:text-slate-300">{l("plan.workers")}</div>
                        <div>
                        {(project.assignments ?? []).length > 0
                          ? (project.assignments ?? []).map((assignment) => `${assignment.worker.firstName} ${assignment.worker.lastName}`).join(", ")
                          : l("plan.noWorkers")}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Aufgezogenen Termin einem Projekt zuweisen */}
      {drawProjectPicker ? (
        <SectionCard title="Neuen Termin zuweisen" subtitle={`${drawProjectPicker.startDay}. – ${drawProjectPicker.endDay}. ${new Date(year, month - 1).toLocaleDateString(locale, { month: "long", year: "numeric" })}`}>
          <div className="grid gap-3">
            <p className="text-sm text-slate-500">{l("plan.selectProjectForPeriod")}</p>
            {projects.filter((p) => !p.plannedStartDate).map((p) => (
              <button key={p.id} type="button" onClick={async () => {
                const startDate = `${year}-${String(month).padStart(2, "0")}-${String(drawProjectPicker.startDay).padStart(2, "0")}`;
                const endDate = `${year}-${String(month).padStart(2, "0")}-${String(drawProjectPicker.endDay).padStart(2, "0")}`;
                try {
                  await apiFetch(`/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ plannedStartDate: startDate, plannedEndDate: endDate }) });
                  setDrawProjectPicker(null);
                  onDataChanged();
                } catch { /* */ }
              }} className="rounded-xl border border-black/10 px-4 py-3 text-left text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">
                <div className="font-medium">{p.projectNumber} – {p.title}</div>
                <div className="text-xs text-slate-500">{p.customer?.companyName ?? "-"}</div>
              </button>
            ))}
            {projects.filter((p) => !p.plannedStartDate).length === 0 ? <p className="text-sm text-slate-500">Alle Projekte haben bereits einen Zeitraum.</p> : null}
            <SecondaryButton onClick={() => setDrawProjectPicker(null)}>{l("common.cancel")}</SecondaryButton>
          </div>
        </SectionCard>
      ) : null}

      {/* Planungsformular */}
      {selectedProject ? (
        <SectionCard title={`${l("plan.planningLabel")} ${selectedProject.title}`} subtitle={`${selectedProject.projectNumber} · ${selectedProject.customer?.companyName ?? ""}`}>
          <MessageBar error={planErr} success={planMsg} />
          <div className="grid gap-4">
            <FormRow>
              <Field label={l("plan.startDate")} type="date" value={planForm.startDate} onChange={(e) => setPlanForm((c) => ({ ...c, startDate: e.target.value }))} />
              <Field label={l("plan.endDate")} type="date" value={planForm.endDate} onChange={(e) => setPlanForm((c) => ({ ...c, endDate: e.target.value }))} />
            </FormRow>
            {teams.length > 0 ? (
              <SelectField label={l("plan.assignTeam")} value={planForm.teamId}
                onChange={(e) => { setPlanForm((c) => ({ ...c, teamId: e.target.value })); if (e.target.value) applyTeam(e.target.value); }}
                options={teams.map((t) => ({ value: t.id, label: `${t.name} (${t.members.length} ${l("plan.workers")})` }))} />
            ) : null}
            <div className="grid gap-2">
              <label className="text-sm font-medium">{l("plan.workers")}</label>
              <div className="flex flex-wrap gap-2">
                {workers.filter((w) => w.active !== false).map((w) => (
                  <label key={w.id} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                    <input type="checkbox" checked={planForm.workerIds.includes(w.id)}
                      onChange={(e) => setPlanForm((c) => ({ ...c, workerIds: e.target.checked ? [...c.workerIds, w.id] : c.workerIds.filter((x) => x !== w.id) }))} />
                    {w.firstName} {w.lastName}
                  </label>
                ))}
              </div>
            </div>

            {/* Konflikte */}
            {(() => { const c = checkConflicts(); return c.length > 0 ? (
              <div className="rounded-xl border border-red-300 bg-red-50/60 p-3 dark:border-red-500/30 dark:bg-red-500/5">
                <h4 className="mb-1 text-xs font-semibold uppercase text-red-700 dark:text-red-400">{l("plan.conflictsTitle")}</h4>
                {c.map((x, i) => <div key={i} className="text-xs text-red-600 dark:text-red-300">{x}</div>)}
              </div>
            ) : null; })()}

            <div className="flex gap-3">
              <button type="button" disabled={planSaving} onClick={() => void savePlan()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
                {planSaving ? l("plan.saving") : l("plan.savePlan")}
              </button>
              <SecondaryButton onClick={() => setSelectedProject(null)}>{l("common.close")}</SecondaryButton>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* Projektliste unter Kalender */}
      <SectionCard title={l("plan.plannedProjects")} subtitle={`${plannable.length} ${l("plan.projectsWithPeriod")}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="pb-2 pr-2">{l("table.nr")}</th><th className="pb-2 pr-2">{l("table.title")}</th><th className="pb-2 pr-2">{l("table.customer")}</th><th className="pb-2 pr-2">{l("table.status")}</th><th className="pb-2 pr-2">{l("table.period")}</th><th className="pb-2">{l("table.workers")}</th>
              </tr>
            </thead>
            <tbody>
              {plannable.map((p) => (
                <tr key={p.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-2 font-mono text-xs">{p.projectNumber}</td>
                  <td className="py-2 pr-2 text-xs">{p.title}</td>
                  <td className="py-2 pr-2 text-xs">{p.customer?.companyName ?? "-"}</td>
                  <td className="py-2 pr-2 text-xs">{p.status}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{p.plannedStartDate?.slice(0, 10) ?? "-"} – {p.plannedEndDate?.slice(0, 10) ?? l("worker.open")}</td>
                  <td className="py-2 text-xs">{(p.assignments ?? []).map((a) => `${a.worker.firstName} ${a.worker.lastName}`).join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

