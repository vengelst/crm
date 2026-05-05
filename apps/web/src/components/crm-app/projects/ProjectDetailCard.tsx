"use client";
import { useI18n } from "../../../i18n-context";

import Link from "next/link";
import { type Dispatch, type SetStateAction, Fragment, useEffect, useMemo, useState } from "react";
import type {
  Project, ProjectFinancials, TimesheetItem, DocumentItem, Worker,
  DocumentFormState,
  ProjectAssignmentTimeSummary,
} from "../types";
import { CollapsibleContent, CollapseIndicator, cx, formatAddress, mapsUrlFromParts, SecondaryButton, MapLinkButton, PrintButton, openPrintWindow, MessageBar } from "../shared";
import { DocumentPanel } from "../documents";
import { TimesheetList } from "./TimesheetList";
import { ProjectWorkRecordsModal } from "./ProjectWorkRecordsModal";
import { ProjectChecklistSection } from "./ProjectChecklistSection";
import { ProjectNoticesSection } from "./ProjectNoticesSection";
import { FinancialKpi } from "./FinancialKpi";
import {
  PrintConfiguratorModal,
  composeSelectedHtml,
  escapeHtml,
  type PrintSelectionPayload,
  renderDocumentList,
} from "../print";
import { EmbeddedRemindersSection } from "../reminders";

export function ProjectDetailCard({
  project,
  workers,
  financials,
  timesheets,
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
  onDataChanged,
  onEdit,
  onEditWorker,
  canPrint = true,
  apiFetch,
  currentUserId,
  onRemindersChanged,
}: {
  project: Project;
  workers: Worker[];
  financials: ProjectFinancials | null;
  timesheets: TimesheetItem[];
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument?: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void | Promise<void>;
  onDataChanged: () => Promise<void> | void;
  onEdit?: () => void;
  /** Direkter Klick-Handler fuer einen Monteur in der Team-Liste. Aufruf
   *  oeffnet die Monteur-Bearbeitung (Modal in `crm-app.tsx`). Wenn
   *  nicht gesetzt, behaelt die Liste den bestehenden Link auf
   *  `/workers/{id}`. */
  onEditWorker?: (workerId: string) => void;
  canPrint?: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Aktueller Nutzer als Default-Verantwortlicher fuer neue Wiedervorlagen. */
  currentUserId?: string;
  /** Wird aufgerufen, wenn sich die Reminder-Counts geaendert haben. */
  onRemindersChanged?: () => void;
}) {
  const { t: l, locale } = useI18n();
  const [showWorkRecords, setShowWorkRecords] = useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentMsg, setAssignmentMsg] = useState<string | null>(null);
  const [assignmentErr, setAssignmentErr] = useState<string | null>(null);
  const [financialsOpen, setFinancialsOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [showInactiveWorkers, setShowInactiveWorkers] = useState(false);
  const [workerSearch, setWorkerSearch] = useState("");
  const [assignmentTimeSummary, setAssignmentTimeSummary] = useState<ProjectAssignmentTimeSummary[] | null>(null);
  const [assignmentTimeLoadErr, setAssignmentTimeLoadErr] = useState<string | null>(null);

  // Status-Pille (Farben analog Kunden-Detail)
  const statusLabel = (status?: string) => {
    if (!status) return l("proj.noStatus");
    return l(`status.${status}`) !== `status.${status}` ? l(`status.${status}`) : status;
  };
  const statusColor = (status?: string) => {
    switch (status) {
      case "ACTIVE": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
      case "COMPLETED": return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300";
      case "PAUSED": return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300";
      case "CANCELED": return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300";
      case "PLANNED": return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
      default: return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    }
  };

  function scrollToId(id: string) {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const projectMapsUrl = mapsUrlFromParts([
    project.title,
    project.siteAddressLine1,
    project.sitePostalCode,
    project.siteCity,
    project.siteCountry,
  ]);

  const hasPricing = project.weeklyFlatRate != null || project.hourlyRateUpTo40h != null || project.includedHoursPerWeek != null || project.overtimeRate != null;
  // Wiedervorlagen werden im eigenen Embed-Bereich verwaltet (FOLLOW_UP).
  // Der Header-Link bleibt als Quick-Link in das zentrale Erinnerungsmodul,
  // ist aber jetzt fachlich korrekt als FOLLOW_UP vorbelegt.
  const projectReminderHref = `/settings?tab=reminders&kind=FOLLOW_UP&customerId=${encodeURIComponent(project.customerId)}&projectId=${encodeURIComponent(project.id)}&title=${encodeURIComponent(`${l("reminder.prefixFollowUp")} ${project.projectNumber} ${project.title}`)}`;

  const fmt = (value?: number | null) => value != null ? `${value.toFixed(2)} EUR` : "-";

  const assignmentWorkerKey = useMemo(
    () =>
      [...(project.assignments ?? []).map((a) => a.worker.id)].sort().join(","),
    [project.assignments],
  );

  useEffect(() => {
    setSelectedWorkerIds((project.assignments ?? []).map((assignment) => assignment.worker.id));
  }, [project.assignments]);

  useEffect(() => {
    let cancelled = false;
    setAssignmentTimeLoadErr(null);
    void apiFetch<ProjectAssignmentTimeSummary[]>(`/projects/${project.id}/assignment-time-summary`)
      .then((rows) => {
        if (!cancelled) setAssignmentTimeSummary(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setAssignmentTimeSummary(null);
          setAssignmentTimeLoadErr(l("proj.assignmentTimeLoadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, assignmentWorkerKey, apiFetch, l]);

  function formatTodayMinutes(totalMin: number): string {
    if (totalMin <= 0) return `0 ${l("proj.assignmentTimeMinShort")}`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m} ${l("proj.assignmentTimeMinShort")}`;
    if (m === 0) return `${h} ${l("proj.assignmentTimeHourShort")}`;
    return `${h} ${l("proj.assignmentTimeHourShort")} ${m} ${l("proj.assignmentTimeMinShort")}`;
  }

  async function saveAssignments() {
    setAssignmentSaving(true);
    setAssignmentErr(null);
    setAssignmentMsg(null);
    try {
      const fallbackDate = new Date().toISOString().slice(0, 10);
      await apiFetch(`/projects/${project.id}/assignments`, {
        method: "PUT",
        body: JSON.stringify({
          workerIds: selectedWorkerIds,
          startDate: project.plannedStartDate?.slice(0, 10) ?? fallbackDate,
          endDate: project.plannedEndDate?.slice(0, 10) ?? undefined,
        }),
      });
      setAssignmentMsg(l("proj.assignmentSaved"));
      await onDataChanged();
    } catch (error) {
      setAssignmentErr(error instanceof Error ? error.message : l("common.error"));
    } finally {
      setAssignmentSaving(false);
    }
  }

  const [showPrintConfig, setShowPrintConfig] = useState(false);

  function buildSectionRenderers(): Record<string, () => string> {
    const addr = formatAddress([
      project.siteAddressLine1, project.sitePostalCode, project.siteCity, project.siteCountry,
    ]);
    return {
      masterData: () => `<h2>${escapeHtml(l("print.projectData"))}</h2>
        <div class="grid">
          <span class="label">${escapeHtml(l("print.customer"))}</span><span>${escapeHtml(project.customer?.companyName ?? "-")}</span>
          <span class="label">${escapeHtml(l("print.site"))}</span><span>${escapeHtml(addr || "-")}</span>
          <span class="label">${escapeHtml(l("print.status"))}</span><span>${escapeHtml(project.status ?? "-")}</span>
          <span class="label">${escapeHtml(l("print.serviceType"))}</span><span>${escapeHtml(project.serviceType ?? "-")}</span>
          ${project.description ? `<span class="label">${escapeHtml(l("print.description"))}</span><span>${escapeHtml(project.description)}</span>` : ""}
        </div>`,
      pricing: () => {
        if (!hasPricing) return "";
        return `<h2>${escapeHtml(l("print.prices"))}</h2><div class="grid">
          <span class="label">${escapeHtml(l("print.weeklyFlat"))}</span><span>${escapeHtml(fmt(project.weeklyFlatRate))}</span>
          <span class="label">${escapeHtml(l("print.includedHours"))}</span><span>${escapeHtml(project.includedHoursPerWeek != null ? `${project.includedHoursPerWeek} h` : "-")}</span>
          <span class="label">${escapeHtml(l("print.hourlyRate"))}</span><span>${escapeHtml(fmt(project.hourlyRateUpTo40h))}</span>
          <span class="label">${escapeHtml(l("print.overtimeRate"))}</span><span>${escapeHtml(fmt(project.overtimeRate))}</span>
        </div>`;
      },
      workers: () => {
        const list = project.assignments ?? [];
        if (list.length === 0) return "";
        const rows = list
          .map((a) => `<tr><td>${escapeHtml(`${a.worker.firstName} ${a.worker.lastName}`)}</td><td>${escapeHtml(a.worker.workerNumber)}</td></tr>`)
          .join("");
        return `<h2>${escapeHtml(l("print.workers"))}</h2><table><thead><tr><th>${escapeHtml(l("print.name"))}</th><th>${escapeHtml(l("print.number"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      },
      financials: () => {
        if (!financials) return "";
        return `<h2>${escapeHtml(l("proj.financials"))}</h2>
          <div class="grid">
            <span class="label">${escapeHtml(l("kpi.totalHours"))}</span><span>${escapeHtml(`${financials.totalHours} h`)}</span>
            <span class="label">${escapeHtml(l("kpi.overtime"))}</span><span>${escapeHtml(`${financials.overtimeHours} h`)}</span>
            <span class="label">${escapeHtml(l("kpi.totalRevenue"))}</span><span>${escapeHtml(`${financials.totalRevenue.toFixed(2)} EUR`)}</span>
            <span class="label">${escapeHtml(l("kpi.workerCosts"))}</span><span>${escapeHtml(`${financials.totalCosts.toFixed(2)} EUR`)}</span>
            <span class="label">${escapeHtml(l("kpi.margin"))}</span><span>${escapeHtml(`${financials.margin.toFixed(2)} EUR`)}</span>
          </div>`;
      },
      timesheets: () => {
        if (timesheets.length === 0) return "";
        const rows = timesheets
          .map((t) => `<tr><td>${escapeHtml(`${t.weekYear}-W${String(t.weekNumber).padStart(2, "0")}`)}</td><td>${escapeHtml(t.worker ? `${t.worker.firstName} ${t.worker.lastName}` : "-")}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml((t.totalMinutesNet / 60).toFixed(2))} h</td></tr>`)
          .join("");
        return `<h2>${escapeHtml(l("ts.title"))}</h2><table><thead><tr><th>${escapeHtml(l("table.cw"))}</th><th>${escapeHtml(l("table.worker"))}</th><th>${escapeHtml(l("table.status"))}</th><th>${escapeHtml(l("kpi.hours"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      },
      notices: () => (project.notes ? `<h2>${escapeHtml(l("print.notes"))}</h2><p>${escapeHtml(project.notes)}</p>` : ""),
      documents: () => "", // handled by handleConfiguredPrint below
    };
  }

  function handleConfiguredPrint(payload: PrintSelectionPayload) {
    const renderers = buildSectionRenderers();
    const sectionsExceptDocuments = payload.sections.filter((s) => s !== "documents");
    let html = `<h1>${escapeHtml(project.title)}</h1>
      <p class="meta">${escapeHtml(project.projectNumber)} · ${escapeHtml(project.customer?.companyName ?? "-")} · ${escapeHtml(project.status ?? "-")}</p>`;
    html += composeSelectedHtml(sectionsExceptDocuments, renderers);
    if (payload.sections.includes("documents") && payload.includeDocuments) {
      html += renderDocumentList({
        headline: l("print.section.project.documents"),
        emptyLabel: l("print.cfg.noDocumentsSelected"),
        documents,
        selectedIds: payload.documentIds,
      });
    }
    openPrintWindow(`${l("print.project")} ${project.projectNumber}`, html);
    setShowPrintConfig(false);
  }

  // Filter/Sort fuer den Verwaltungsblock: Suchfeld matcht Name/Nummer.
  // Bereits zugewiesene Monteure werden separat gerendert; "verfuegbar"
  // sind alle anderen aktiven Monteure (mit optionalem Inaktiv-Toggle).
  const search = workerSearch.trim().toLowerCase();
  const matches = (worker: Worker) => {
    if (!search) return true;
    return (
      `${worker.firstName} ${worker.lastName}`.toLowerCase().includes(search) ||
      worker.workerNumber.toLowerCase().includes(search)
    );
  };
  const assignedWorkerObjects = workers.filter((w) => selectedWorkerIds.includes(w.id) && matches(w));
  const availableActiveWorkers = workers.filter(
    (w) => !selectedWorkerIds.includes(w.id) && w.active !== false && matches(w),
  );
  const availableInactiveWorkers = workers.filter(
    (w) => !selectedWorkerIds.includes(w.id) && w.active === false && matches(w),
  );

  function toggleWorker(workerId: string) {
    setSelectedWorkerIds((current) =>
      current.includes(workerId)
        ? current.filter((id) => id !== workerId)
        : [...current, workerId],
    );
  }

  return (
    <div className="grid gap-5">
      {/* ── Header / Kompaktansicht + gebündelte Aktionen ── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{project.title}</h3>
            <p className="text-sm text-slate-500">
              {project.projectNumber} · {project.customer?.companyName ?? l("proj.noCustomer")}
              <span className={cx("ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium align-middle", statusColor(project.status))}>
                {statusLabel(project.status)}
              </span>
            </p>
            <div className="mt-2 text-sm text-slate-500">
              {formatAddress([
                project.siteAddressLine1,
                project.sitePostalCode,
                project.siteCity,
                project.siteCountry,
              ]) || l("proj.noSiteAddress")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M2.695 14.762l-1.262 3.155a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.886L17.5 5.501a2.121 2.121 0 00-3-3L3.58 13.419a4 4 0 00-.885 1.343z" />
                </svg>
                {l("common.edit")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => scrollToId("project-team")}
              className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {l("proj.actionAssignTeam")}
            </button>
            <button
              type="button"
              onClick={() => scrollToId("project-documents")}
              className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {l("proj.actionUploadDocument")}
            </button>
            <Link href={projectReminderHref} className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
              {l("settings.remindersQuickCreate")}
            </Link>
            {canPrint ? <PrintButton onClick={() => setShowPrintConfig(true)} label={l("proj.printProject")} /> : null}
            {projectMapsUrl ? <MapLinkButton href={projectMapsUrl}>{l("common.googleMaps")}</MapLinkButton> : null}
          </div>
        </div>
      </div>

      {/* ── Team und Monteure (Live + Zuordnen kombiniert) ── */}
      <div id="project-team" className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-base font-semibold">{l("proj.assignTeam")}</h4>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={workerSearch}
              onChange={(e) => setWorkerSearch(e.target.value)}
              placeholder={l("proj.teamSearchPlaceholder")}
              className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
            />
            <SecondaryButton onClick={() => void saveAssignments()}>
              {assignmentSaving ? "..." : l("proj.assignmentSave")}
            </SecondaryButton>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">{l("proj.assignmentTimeHint")}</p>
        <MessageBar error={assignmentErr} success={assignmentMsg} />
        {assignmentTimeLoadErr ? (
          <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{assignmentTimeLoadErr}</p>
        ) : null}

        {/* Bereits zugewiesene Monteure mit Live-Status */}
        <div className="mt-2">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("proj.teamAssignedHeading")}</h5>
          {(project.assignments ?? []).length === 0 && assignedWorkerObjects.length === 0 ? (
            <p className="text-sm text-slate-500">{l("proj.noAssignments")}</p>
          ) : (
            <div className="grid gap-2">
              {(project.assignments ?? [])
                .filter((a) => selectedWorkerIds.includes(a.worker.id) && matches({
                  // Map Assignment-Worker auf Worker-Shape fuer matches()
                  id: a.worker.id,
                  firstName: a.worker.firstName,
                  lastName: a.worker.lastName,
                  workerNumber: a.worker.workerNumber,
                  active: true,
                } as Worker))
                .map((assignment) => {
                  const live = assignmentTimeSummary?.find((r) => r.workerId === assignment.worker.id);
                  return (
                    <div
                      key={assignment.id}
                      className="flex flex-col gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/5 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/workers/${assignment.worker.id}`} className="font-medium hover:underline">
                            {assignment.worker.firstName} {assignment.worker.lastName}
                          </Link>
                          <span className="text-xs text-slate-500">{assignment.worker.workerNumber}</span>
                          {onEditWorker ? (
                            <button
                              type="button"
                              onClick={() => onEditWorker(assignment.worker.id)}
                              className="rounded-lg border border-black/10 bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
                              title={l("proj.editWorkerTitle")}
                            >
                              {l("common.edit")}
                            </button>
                          ) : null}
                        </div>
                        {live ? (
                          <div className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-400">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={live.workingOnProjectNow
                                  ? "inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                  : "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"}
                              >
                                {live.workingOnProjectNow ? l("proj.assignmentLiveWorking") : l("proj.assignmentLiveIdle")}
                              </span>
                              {live.workingOnProjectNow && live.openClockInStartedAt ? (
                                <span className="text-slate-500">
                                  {l("proj.assignmentSince")}{" "}
                                  {new Date(live.openClockInStartedAt).toLocaleString(locale)}
                                </span>
                              ) : null}
                            </div>
                            <div>
                              {l("proj.assignmentTodayFirst")}{" "}
                              {live.todayFirstClockInOnProjectAt
                                ? new Date(live.todayFirstClockInOnProjectAt).toLocaleString(locale)
                                : l("proj.assignmentTodayFirstNone")}
                            </div>
                            <div>
                              {l("proj.assignmentTodayOnProject")}{" "}
                              <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                                {formatTodayMinutes(live.todayMinutesOnProject)}
                              </span>
                            </div>
                          </div>
                        ) : assignmentTimeSummary === null && !assignmentTimeLoadErr ? (
                          <div className="mt-1 text-xs text-slate-400">{l("common.loading")}</div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-start gap-3 sm:pt-0.5">
                        <span className="font-mono text-xs text-slate-500">
                          {assignment.worker.internalHourlyRate != null
                            ? `${assignment.worker.internalHourlyRate.toFixed(2)} ${l("proj.internalPerHour")}`
                            : l("proj.noHourlyRate")}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleWorker(assignment.worker.id)}
                          className="rounded-lg border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400"
                        >
                          {l("common.remove")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              {/* Frisch ausgewaehlte aber noch nicht gespeicherte Monteure (selectedIds, die noch nicht in project.assignments sind) */}
              {assignedWorkerObjects
                .filter((w) => !(project.assignments ?? []).some((a) => a.worker.id === w.id))
                .map((worker) => (
                  <div key={worker.id} className="flex items-center justify-between gap-2 rounded-xl border-2 border-emerald-200 border-dashed bg-emerald-50/30 px-3 py-2 text-sm dark:border-emerald-500/20 dark:bg-emerald-500/5">
                    <span>
                      {worker.firstName} {worker.lastName}
                      <span className="ml-2 text-xs text-slate-500">{worker.workerNumber}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleWorker(worker.id)}
                      className="rounded-lg border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400"
                    >
                      {l("common.remove")}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Verfuegbare aktive Monteure */}
        <div className="mt-4">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("proj.teamAvailableHeading")}</h5>
          {availableActiveWorkers.length === 0 ? (
            <p className="text-sm text-slate-500">{search ? l("proj.teamNoMatch") : "—"}</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {availableActiveWorkers.map((worker) => (
                <button
                  key={worker.id}
                  type="button"
                  onClick={() => toggleWorker(worker.id)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-left text-sm transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5"
                >
                  <span>
                    <span className="font-medium">{worker.firstName} {worker.lastName}</span>
                    <span className="ml-2 text-xs text-slate-500">{worker.workerNumber}</span>
                  </span>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">+</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Inaktive Monteure (sekundaer, nur wenn explizit eingeblendet) */}
        {availableInactiveWorkers.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowInactiveWorkers((v) => !v)}
              className="text-xs font-medium text-slate-500 underline-offset-4 hover:underline"
            >
              {showInactiveWorkers ? l("proj.teamHideInactive") : l("proj.teamShowInactive")} ({availableInactiveWorkers.length})
            </button>
            {showInactiveWorkers ? (
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {availableInactiveWorkers.map((worker) => (
                  <button
                    key={worker.id}
                    type="button"
                    onClick={() => toggleWorker(worker.id)}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-black/10 bg-white px-3 py-2 text-left text-sm text-slate-500 transition hover:border-emerald-300 dark:border-white/10 dark:bg-slate-900"
                  >
                    <span>
                      {worker.firstName} {worker.lastName}
                      <span className="ml-2 text-xs">({l("common.inactive")})</span>
                    </span>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">+</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Auswertung (sekundaer, einklappbar) ─────────── */}
      {financials ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={() => setFinancialsOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <h4 className="text-base font-semibold">{l("proj.financials")}</h4>
            <CollapseIndicator open={financialsOpen} />
          </button>
          <CollapsibleContent open={financialsOpen}>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <FinancialKpi label={l("kpi.totalHours")} value={`${financials.totalHours} h`} />
                <FinancialKpi label={l("kpi.overtime")} value={`${financials.overtimeHours} h`} />
                <FinancialKpi label={l("kpi.totalRevenue")} value={`${financials.totalRevenue.toFixed(2)} EUR`} highlight />
                <FinancialKpi label={l("kpi.workerCosts")} value={`${financials.totalCosts.toFixed(2)} EUR`} />
                <FinancialKpi label={l("kpi.margin")} value={`${financials.margin.toFixed(2)} EUR`} highlight={financials.margin >= 0} warn={financials.margin < 0} />
              </div>

              <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("kpi.revenueBreakdown")}</h5>
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-500">{financials.pricingModel === "WEEKLY_FLAT_RATE" ? l("kpi.weeklyFlatRates") : l("kpi.baseHours")}</span>
                  <span className="text-right font-mono">{financials.baseRevenue.toFixed(2)} EUR</span>
                  <span className="text-slate-500">{l("kpi.overtimeRevenue")}</span>
                  <span className="text-right font-mono">{financials.overtimeRevenue.toFixed(2)} EUR</span>
                  <span className="font-medium">{l("kpi.totalRevenue")}</span>
                  <span className="text-right font-mono font-medium">{financials.totalRevenue.toFixed(2)} EUR</span>
                </div>
              </div>

              {financials.workerCosts.length > 0 ? (
                <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("kpi.workerCosts")}</h5>
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 text-sm">
                    {financials.workerCosts.map((wc) => (
                      <Fragment key={wc.workerId}>
                        <span className="text-slate-500">{wc.name}</span>
                        <span className="text-right font-mono text-slate-400">{wc.hours} h</span>
                        <span className="text-right font-mono text-slate-400">{wc.rate != null ? `${wc.rate.toFixed(2)} EUR/h` : "-"}</span>
                        <span className="text-right font-mono">{wc.cost.toFixed(2)} EUR</span>
                      </Fragment>
                    ))}
                    <span className="font-medium">{l("kpi.totalCosts")}</span>
                    <span />
                    <span />
                    <span className="text-right font-mono font-medium">{financials.totalCosts.toFixed(2)} EUR</span>
                  </div>
                </div>
              ) : null}

              {financials.weeklyBreakdown.length > 0 ? (
                <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("reports.weekDetail")}</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500">
                          <th className="pb-1 pr-3">{l("table.cw")}</th>
                          <th className="pb-1 pr-3 text-right">{l("kpi.hours")}</th>
                          <th className="pb-1 pr-3 text-right">{l("table.overtimeShort")}</th>
                          <th className="pb-1 pr-3 text-right">{l("kpi.baseRevenue")}</th>
                          <th className="pb-1 text-right">{l("table.overtimeRevShort")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financials.weeklyBreakdown.map((w) => (
                          <tr key={w.week} className="border-t border-black/5 dark:border-white/5">
                            <td className="py-1 pr-3 font-mono text-xs">{w.week}</td>
                            <td className="py-1 pr-3 text-right font-mono">{w.hours}</td>
                            <td className="py-1 pr-3 text-right font-mono">{w.overtimeHours}</td>
                            <td className="py-1 pr-3 text-right font-mono">{w.baseRevenue.toFixed(2)}</td>
                            <td className="py-1 text-right font-mono">{w.overtimeRevenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
        </div>
      ) : null}

      {/* ── Stundenzettel ──────────────────────────────── */}
      <div className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="text-base font-semibold">{l("ts.title")}</h4>
        <button
          type="button"
          onClick={() => setShowWorkRecords(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm4.75 11.25a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zM7.5 15a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5A.75.75 0 017.5 15zm.75-3.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
          </svg>
          {l("proj.openWorkRecords")}
        </button>
      </div>
      <TimesheetList timesheets={timesheets} apiFetch={apiFetch} />

      {/* ── Checklisten ────────────────────────────────── */}
      <ProjectChecklistSection projectId={project.id} apiFetch={apiFetch} isAdmin={true} />

      {/* ── Baustellenhinweise ─────────────────────────── */}
      <ProjectNoticesSection projectId={project.id} apiFetch={apiFetch} isAdmin={true} />

      {/* ── Wiedervorlagen (FOLLOW_UP) ─────────────────── */}
      {currentUserId ? (
        <EmbeddedRemindersSection
          scope={{ kind: "project", projectId: project.id, customerId: project.customerId }}
          apiFetch={apiFetch}
          currentUserId={currentUserId}
          onChanged={onRemindersChanged}
        />
      ) : null}

      {/* ── Abrechnungsfreigabe ────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold">{l("proj.billingTitle")}</h4>
          {project.billingReady ? (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
              {l("proj.billingReady")}{project.billingReadyAt ? ` ${l("proj.billingReadySince")} ${new Date(project.billingReadyAt).toLocaleDateString(locale)}` : ""}
            </span>
          ) : (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{l("proj.billingNotReady")}</span>
          )}
        </div>
        {project.billingReadyComment ? <p className="mt-1 text-xs text-slate-500">{project.billingReadyComment}</p> : null}
        <div className="mt-2">
          <button type="button" onClick={() => void apiFetch(`/projects/${project.id}/billing-ready`, { method: "POST", body: JSON.stringify({ ready: !project.billingReady }) })}
            className={cx("rounded-lg px-3 py-1.5 text-xs font-medium transition",
              project.billingReady ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400" : "bg-emerald-600 text-white hover:bg-emerald-500"
            )}>
            {project.billingReady ? l("proj.billingRevoke") : l("proj.billingMark")}
          </button>
        </div>
      </div>

      {/* ── Dokumente ───────────────────────────────────── */}
      <div id="project-documents" className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <DocumentPanel
          documents={documents}
          onOpenDocument={onOpenDocument}
          onPrintDocument={onPrintDocument}
          onDownload={onDownload}
          onDeleteDocument={onDeleteDocument}
          documentForm={documentForm}
          setDocumentForm={setDocumentForm}
          authToken={authToken}
          onUpload={onUpload}
          onApproveDocument={(docId) => void apiFetch(`/documents/${docId}/approve`, { method: "POST", body: JSON.stringify({}) })}
          onRejectDocument={(docId) => void apiFetch(`/documents/${docId}/reject`, { method: "POST", body: JSON.stringify({}) })}
        />
      </div>

      {/* ── Projektpreise (sekundaer, einklappbar) ──────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPricingOpen((v) => !v)}
            className="flex flex-1 items-center justify-between gap-3 text-left"
          >
            <h4 className="text-base font-semibold">{l("proj.pricing")}</h4>
            <CollapseIndicator open={pricingOpen} />
          </button>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="ml-2 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
              title={l("proj.editPricingTitle")}
            >
              {l("common.edit")}
            </button>
          ) : null}
        </div>
        <CollapsibleContent open={pricingOpen}>
          {hasPricing ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="text-slate-500">{l("proj.weeklyFlatRate")}</div>
              <div className="font-mono">{fmt(project.weeklyFlatRate)}</div>
              <div className="text-slate-500">{l("proj.includedHours")}</div>
              <div className="font-mono">{project.includedHoursPerWeek != null ? `${project.includedHoursPerWeek} h` : "-"}</div>
              <div className="text-slate-500">{l("proj.hourlyRate")}</div>
              <div className="font-mono">{fmt(project.hourlyRateUpTo40h)}</div>
              <div className="text-slate-500">{l("proj.overtimeRate")}</div>
              <div className="font-mono">{fmt(project.overtimeRate)}</div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{l("proj.noPricing")}</p>
          )}
        </CollapsibleContent>
      </div>

      {showWorkRecords ? (
        <ProjectWorkRecordsModal
          onClose={() => setShowWorkRecords(false)}
          timesheets={timesheets}
          apiFetch={apiFetch}
          onRefreshTimesheets={async () => { if (onDataChanged) await onDataChanged(); }}
          documents={documents}
          onOpenDocument={onOpenDocument}
          onPrintDocument={onPrintDocument}
          onDownload={onDownload}
          onDeleteDocument={onDeleteDocument}
          documentForm={documentForm}
          setDocumentForm={setDocumentForm}
          authToken={authToken}
          onUpload={onUpload}
          onApproveDocument={(docId) => void apiFetch(`/documents/${docId}/approve`, { method: "POST", body: JSON.stringify({}) })}
          onRejectDocument={(docId) => void apiFetch(`/documents/${docId}/reject`, { method: "POST", body: JSON.stringify({}) })}
        />
      ) : null}

      {showPrintConfig ? (
        <PrintConfiguratorModal
          entityType="project"
          entityId={project.id}
          title={`${l("proj.printProject")} — ${project.projectNumber}`}
          documents={documents}
          onClose={() => setShowPrintConfig(false)}
          onPrint={handleConfiguredPrint}
        />
      ) : null}
    </div>
  );
}

