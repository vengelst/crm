"use client";
import { useI18n } from "../../../i18n-context";

import Link from "next/link";
import { type Dispatch, type SetStateAction, Fragment, useEffect, useState } from "react";
import type {
  Project, ProjectFinancials, TimesheetItem, DocumentItem, Worker,
  DocumentFormState,
} from "../types";
import { cx, formatAddress, mapsUrlFromParts, SecondaryButton, MapLinkButton, PrintButton, openPrintWindow, MessageBar } from "../shared";
import { DocumentPanel } from "../documents";
import { TimesheetList } from "./TimesheetList";
import { ProjectWorkRecordsModal } from "./ProjectWorkRecordsModal";
import { ProjectChecklistSection } from "./ProjectChecklistSection";
import { ProjectNoticesSection } from "./ProjectNoticesSection";
import { FinancialKpi } from "./FinancialKpi";

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
  apiFetch,
}: {
  project: Project;
  workers: Worker[];
  financials: ProjectFinancials | null;
  timesheets: TimesheetItem[];
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void | Promise<void>;
  onDataChanged: () => Promise<void> | void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const { t: l, locale } = useI18n();
  const [showWorkRecords, setShowWorkRecords] = useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentMsg, setAssignmentMsg] = useState<string | null>(null);
  const [assignmentErr, setAssignmentErr] = useState<string | null>(null);
  const [financialsOpen, setFinancialsOpen] = useState(false);
  const projectMapsUrl = mapsUrlFromParts([
    project.title,
    project.siteAddressLine1,
    project.sitePostalCode,
    project.siteCity,
    project.siteCountry,
  ]);

  const hasPricing = project.weeklyFlatRate != null || project.hourlyRateUpTo40h != null || project.includedHoursPerWeek != null || project.overtimeRate != null;
  const projectReminderHref = `/settings?tab=reminders&kind=TODO&customerId=${encodeURIComponent(project.customerId)}&projectId=${encodeURIComponent(project.id)}&title=${encodeURIComponent(`${l("reminder.prefixTodo")} ${project.projectNumber} ${project.title}`)}`;

  const fmt = (value?: number | null) => value != null ? `${value.toFixed(2)} EUR` : "-";

  useEffect(() => {
    setSelectedWorkerIds((project.assignments ?? []).map((assignment) => assignment.worker.id));
  }, [project.assignments]);

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

  function printProject() {
    const addr = formatAddress([project.siteAddressLine1, project.sitePostalCode, project.siteCity, project.siteCountry]);
    const workers = (project.assignments ?? []).map((a) => `<tr><td>${a.worker.firstName} ${a.worker.lastName}</td><td>${a.worker.workerNumber}</td></tr>`).join("");
    openPrintWindow(`${l("print.project")} ${project.projectNumber}`, `
      <h1>${project.title}</h1>
      <p class="meta">${project.projectNumber} · ${project.customer?.companyName ?? "-"} · ${project.status ?? "-"}</p>
      <h2>${l("print.projectData")}</h2>
      <div class="grid">
        <span class="label">${l("print.customer")}</span><span>${project.customer?.companyName ?? "-"}</span>
        <span class="label">${l("print.site")}</span><span>${addr || "-"}</span>
        <span class="label">${l("print.status")}</span><span>${project.status ?? "-"}</span>
        <span class="label">${l("print.serviceType")}</span><span>${project.serviceType ?? "-"}</span>
        ${project.description ? `<span class="label">${l("print.description")}</span><span>${project.description}</span>` : ""}
      </div>
      ${hasPricing ? `<h2>${l("print.prices")}</h2><div class="grid">
        <span class="label">${l("print.weeklyFlat")}</span><span>${fmt(project.weeklyFlatRate)}</span>
        <span class="label">${l("print.includedHours")}</span><span>${project.includedHoursPerWeek != null ? project.includedHoursPerWeek + " h" : "-"}</span>
        <span class="label">${l("print.hourlyRate")}</span><span>${fmt(project.hourlyRateUpTo40h)}</span>
        <span class="label">${l("print.overtimeRate")}</span><span>${fmt(project.overtimeRate)}</span>
      </div>` : ""}
      ${workers ? `<h2>${l("print.workers")}</h2><table><thead><tr><th>${l("print.name")}</th><th>${l("print.number")}</th></tr></thead><tbody>${workers}</tbody></table>` : ""}
      ${project.notes ? `<h2>${l("print.notes")}</h2><p>${project.notes}</p>` : ""}
    `);
  }

  return (
    <div className="grid gap-5">
      {/* ── Stammdaten ──────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{project.title}</h3>
            <p className="text-sm text-slate-500">
              {project.projectNumber} · {project.customer?.companyName ?? l("proj.noCustomer")}
            </p>
          </div>
          <div className="flex gap-2">
            {projectMapsUrl ? <MapLinkButton href={projectMapsUrl}>{l("common.googleMaps")}</MapLinkButton> : null}
            <Link href={projectReminderHref} className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
              {l("settings.remindersQuickCreate")}
            </Link>
            <PrintButton onClick={printProject} label={l("proj.printProject")} />
          </div>
        </div>
        <div className="mt-2 grid gap-1 text-sm text-slate-500">
          <div>{project.status ?? l("proj.noStatus")}</div>
          <div>
            {formatAddress([
              project.siteAddressLine1,
              project.sitePostalCode,
              project.siteCity,
              project.siteCountry,
            ]) || l("proj.noSiteAddress")}
          </div>
        </div>
      </div>

      {/* ── Projektpreise ───────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">{l("proj.pricing")}</h4>
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
      </div>

      {/* ── Eingeteilte Monteure mit Stundensatz ────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">{l("proj.assignments")}</h4>
        {(project.assignments ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{l("proj.noAssignments")}</p>
        ) : (
          <div className="grid gap-2">
            {(project.assignments ?? []).map((assignment) => (
              <Link
                key={assignment.id}
                href={`/workers/${assignment.worker.id}`}
                className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div>
                  <div className="font-medium">{assignment.worker.firstName} {assignment.worker.lastName}</div>
                  <div className="text-slate-500">{assignment.worker.workerNumber}</div>
                </div>
                <div className="text-right font-mono text-xs text-slate-500">
                  {assignment.worker.internalHourlyRate != null
                    ? `${assignment.worker.internalHourlyRate.toFixed(2)} ${l("proj.internalPerHour")}`
                    : l("proj.noHourlyRate")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-1 text-base font-semibold">{l("proj.manageAssignments")}</h4>
        <p className="mb-3 text-sm text-slate-500">{l("proj.assignmentHint")}</p>
        <MessageBar error={assignmentErr} success={assignmentMsg} />
        <div className="mt-3 grid gap-2">
          {workers
            .filter((worker) => worker.active !== false || selectedWorkerIds.includes(worker.id))
            .map((worker) => (
            <label key={worker.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
              <span>
                {worker.firstName} {worker.lastName}
                <span className="ml-2 text-xs text-slate-500">{worker.workerNumber}</span>
                {worker.active === false ? <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">({l("common.inactive")})</span> : null}
              </span>
              <input
                type="checkbox"
                checked={selectedWorkerIds.includes(worker.id)}
                onChange={(event) =>
                  setSelectedWorkerIds((current) =>
                    event.target.checked
                      ? [...current, worker.id]
                      : current.filter((id) => id !== worker.id),
                  )
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <SecondaryButton onClick={() => void saveAssignments()}>
            {assignmentSaving ? "..." : l("proj.assignmentSave")}
          </SecondaryButton>
        </div>
      </div>

      {/* ── Auswertung ──────────────────────────────────── */}
      {financials ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={() => setFinancialsOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <h4 className="text-base font-semibold">{l("proj.financials")}</h4>
            <span className="text-sm font-medium text-slate-500">{financialsOpen ? "▲" : "▼"}</span>
          </button>
          {financialsOpen ? (
            <div className="mt-3 grid gap-4">
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
          ) : null}
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
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
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
    </div>
  );
}

