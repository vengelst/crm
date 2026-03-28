"use client";
import { useI18n } from "../../../i18n-context";

import Link from "next/link";
import { type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction, Fragment, useMemo, useState } from "react";
import type {
  Project, ProjectFinancials, TimesheetItem, DocumentItem,
  DocumentFormState, DocumentPreviewState,
} from "../types";
import { cx, formatAddress, mapsUrlFromParts, SectionCard, SecondaryButton, MapLinkButton, PrintButton, openPrintWindow } from "../shared";
import { DocumentPanel } from "../documents";
import { TimesheetList } from "./TimesheetList";
import { ProjectChecklistSection } from "./ProjectChecklistSection";
import { ProjectNoticesSection } from "./ProjectNoticesSection";
import { FinancialKpi } from "./FinancialKpi";

export function ProjectDetailCard({
  project,
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
  apiFetch,
}: {
  project: Project;
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
  onUpload: () => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const { t: l, locale } = useI18n();
  const projectMapsUrl = mapsUrlFromParts([
    project.title,
    project.siteAddressLine1,
    project.sitePostalCode,
    project.siteCity,
    project.siteCountry,
  ]);

  const hasPricing = project.weeklyFlatRate != null || project.hourlyRateUpTo40h != null || project.includedHoursPerWeek != null || project.overtimeRate != null;

  const fmt = (value?: number | null) => value != null ? `${value.toFixed(2)} EUR` : "-";

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

      {/* ── Auswertung ──────────────────────────────────── */}
      {financials ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold">{l("proj.financials")}</h4>
          <div className="grid gap-4">
            {/* Kennzahlen */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FinancialKpi label={l("kpi.totalHours")} value={`${financials.totalHours} h`} />
              <FinancialKpi label={l("kpi.overtime")} value={`${financials.overtimeHours} h`} />
              <FinancialKpi label={l("kpi.totalRevenue")} value={`${financials.totalRevenue.toFixed(2)} EUR`} highlight />
              <FinancialKpi label={l("kpi.workerCosts")} value={`${financials.totalCosts.toFixed(2)} EUR`} />
              <FinancialKpi label={l("kpi.margin")} value={`${financials.margin.toFixed(2)} EUR`} highlight={financials.margin >= 0} warn={financials.margin < 0} />
            </div>

            {/* Aufschluesselung */}
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

            {/* Monteurkosten Detail */}
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

            {/* Wochen-Detail */}
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
        </div>
      ) : null}

      {/* ── Stundenzettel ──────────────────────────────── */}
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
    </div>
  );
}

