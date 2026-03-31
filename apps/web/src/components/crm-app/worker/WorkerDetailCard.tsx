"use client";

import Link from "next/link";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n-context";
import type { Worker, Project, DocumentItem, DocumentFormState, WorkerTimeStatus } from "../types";
import { formatAddress, mapsUrlFromParts, SecondaryButton, MapLinkButton, PrintButton, openPrintWindow, MessageBar } from "../shared";
import { DocumentPanel } from "../documents";
import { WorkerElapsedTime } from "./WorkerElapsedTime";
import { formatMinutes } from "./format-minutes";
import { WorkerTimeLog } from "./WorkerTimeLog";

export function WorkerDetailCard({
  worker,
  projects,
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
  worker: Worker;
  projects: Project[];
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
  const { t: l } = useI18n();
  const [timeStatus, setTimeStatus] = useState<WorkerTimeStatus | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentMsg, setAssignmentMsg] = useState<string | null>(null);
  const [assignmentErr, setAssignmentErr] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<WorkerTimeStatus>(`/time/status?workerId=${worker.id}`)
      .then(setTimeStatus)
      .catch(() => setTimeStatus(null));
  }, [apiFetch, worker.id]);

  const workerMapsUrl = mapsUrlFromParts([
    `${worker.firstName} ${worker.lastName}`,
    worker.addressLine1,
    worker.addressLine2,
    worker.postalCode,
    worker.city,
    worker.country,
  ]);

  const now = new Date();
  const allAssignments = worker.assignments ?? [];

  const currentAssignments = allAssignments.filter((a) => {
    const start = new Date(a.startDate);
    const end = a.endDate ? new Date(a.endDate) : null;
    return start <= now && (!end || end >= now);
  });

  const futureAssignments = allAssignments.filter((a) => {
    const start = new Date(a.startDate);
    return start > now;
  });

  const pastAssignments = allAssignments.filter((a) => {
    const end = a.endDate ? new Date(a.endDate) : null;
    return end !== null && end < now;
  });

  const hasOnlyFuture = currentAssignments.length === 0 && futureAssignments.length > 0;
  const assignedProjectIds = useMemo(
    () => new Set((worker.assignments ?? []).map((assignment) => assignment.project.id)),
    [worker.assignments],
  );
  const assignableProjects = useMemo(
    () => projects.filter((project) => !assignedProjectIds.has(project.id)),
    [assignedProjectIds, projects],
  );

  const formatDateRange = (a: { startDate: string; endDate?: string | null }) => {
    const s = a.startDate.slice(0, 10);
    const e = a.endDate ? a.endDate.slice(0, 10) : l("worker.open");
    return `${s} bis ${e}`;
  };

  function printWorker() {
    const addr = formatAddress([worker.addressLine1, worker.addressLine2, worker.postalCode, worker.city, worker.country]);
    const projs = allAssignments.map((a) => `<tr><td>${a.project.projectNumber}</td><td>${a.project.title}</td><td>${formatDateRange(a)}</td></tr>`).join("");
    openPrintWindow(`Monteur ${worker.firstName} ${worker.lastName}`, `
      <h1>${worker.firstName} ${worker.lastName}</h1>
      <p class="meta">${worker.workerNumber} · ${worker.active === false ? l("work.deactivated") : l("common.active")}</p>
      <h2>${l("print.masterData")}</h2>
      <div class="grid">
        <span class="label">${l("print.address")}</span><span>${addr || "-"}</span>
        <span class="label">${l("print.mobile")}</span><span>${worker.phoneMobile ?? worker.phone ?? "-"}</span>
        <span class="label">${l("common.office")}</span><span>${worker.phoneOffice ?? "-"}</span>
        <span class="label">${l("print.email")}</span><span>${worker.email ?? "-"}</span>
        <span class="label">${l("work.hourlyRate")}</span><span>${worker.internalHourlyRate != null ? worker.internalHourlyRate.toFixed(2) + " EUR/h" : "-"}</span>
      </div>
      ${projs ? `<h2>${l("proj.title")}</h2><table><thead><tr><th>Nr.</th><th>Titel</th><th>Zeitraum</th></tr></thead><tbody>${projs}</tbody></table>` : ""}
    `);
  }

  async function addProjectAssignment() {
    if (!selectedProjectId) {
      return;
    }
    const project = projects.find((item) => item.id === selectedProjectId);
    if (!project) {
      return;
    }
    setAssignmentSaving(true);
    setAssignmentErr(null);
    setAssignmentMsg(null);
    try {
      await apiFetch(`/projects/${project.id}/assignments`, {
        method: "PUT",
        body: JSON.stringify({
          workerIds: [...(project.assignments ?? []).map((assignment) => assignment.worker.id), worker.id],
          startDate: project.plannedStartDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          endDate: project.plannedEndDate?.slice(0, 10) ?? undefined,
        }),
      });
      setSelectedProjectId("");
      setAssignmentMsg(l("work.projectAdded"));
      await onDataChanged();
    } catch (error) {
      setAssignmentErr(error instanceof Error ? error.message : l("common.error"));
    } finally {
      setAssignmentSaving(false);
    }
  }

  async function removeProjectAssignment(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }
    setAssignmentSaving(true);
    setAssignmentErr(null);
    setAssignmentMsg(null);
    try {
      await apiFetch(`/projects/${project.id}/assignments`, {
        method: "PUT",
        body: JSON.stringify({
          workerIds: (project.assignments ?? [])
            .map((assignment) => assignment.worker.id)
            .filter((id) => id !== worker.id),
          startDate: project.plannedStartDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          endDate: project.plannedEndDate?.slice(0, 10) ?? undefined,
        }),
      });
      setAssignmentMsg(l("work.projectRemoved"));
      await onDataChanged();
    } catch (error) {
      setAssignmentErr(error instanceof Error ? error.message : l("common.error"));
    } finally {
      setAssignmentSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      {/* ── Stammdaten ──────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {worker.firstName} {worker.lastName}
            </h3>
            <p className="text-sm text-slate-500">{worker.workerNumber}</p>
          </div>
          <div className="flex gap-2">
            {workerMapsUrl ? <MapLinkButton href={workerMapsUrl}>Google Maps</MapLinkButton> : null}
            <PrintButton onClick={printWorker} label="Monteur drucken" />
          </div>
        </div>
        <div className="mt-2 grid gap-1 text-sm text-slate-500">
          <div>{formatAddress([worker.addressLine1, worker.addressLine2, worker.postalCode, worker.city, worker.country]) || l("work.noAddress")}</div>
          <div>
            {worker.email ?? l("work.noEmail")} · Mobil: {worker.phoneMobile ?? worker.phone ?? "-"} ·
            {l("common.office")}: {worker.phoneOffice ?? "-"}
          </div>
        </div>
      </div>

      {/* ── Arbeitsstatus ──────────────────────────────── */}
      {timeStatus?.hasOpenWork && timeStatus.openEntry ? (
        <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{l("work.workingNow")}</div>
          <div className="font-semibold">{timeStatus.openEntry.projectTitle} ({timeStatus.openEntry.projectNumber})</div>
          <WorkerElapsedTime startedAt={timeStatus.openEntry.startedAt} />
          {timeStatus.todayStats ? (
            <div className="mt-2 text-sm text-slate-500">{l("work.todayTotal")} {formatMinutes(timeStatus.todayStats.totalMinutes)}</div>
          ) : null}
        </div>
      ) : timeStatus?.todayStats && timeStatus.todayStats.completedMinutes > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <div className="text-sm text-slate-500">{l("work.todayWorked")} <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{formatMinutes(timeStatus.todayStats.completedMinutes)}</span></div>
        </div>
      ) : null}

      {/* ── Hinweis: nur zukuenftige Projekte ───────────── */}
      {hasOnlyFuture ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/5">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {l("work.noFutureHint")}
          </p>
        </div>
      ) : null}

      {/* ── Aktuelle Projekte ───────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-1 text-base font-semibold">{l("work.manageProjects")}</h4>
        <p className="mb-3 text-sm text-slate-500">{l("work.projectAssignmentHint")}</p>
        <MessageBar error={assignmentErr} success={assignmentMsg} />
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="min-w-[260px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
          >
            <option value="">{l("work.selectProjectAssign")}</option>
            {assignableProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.projectNumber} - {project.title}
              </option>
            ))}
          </select>
          <SecondaryButton onClick={() => void addProjectAssignment()}>
            {assignmentSaving ? "..." : l("common.add")}
          </SecondaryButton>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">{l("work.currentProjects")}</h4>
        {currentAssignments.length === 0 ? (
          <p className="text-sm text-slate-500">{l("work.noProjects")}</p>
        ) : (
          <div className="grid gap-2">
            {currentAssignments.map((a) => (
              <div key={a.id} className="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                <Link href={`/projects/${a.project.id}`} className="block transition hover:text-sky-600 dark:hover:text-sky-400">
                  <div className="font-medium">{a.project.title}</div>
                  <div className="text-slate-500">{a.project.projectNumber} · {formatDateRange(a)}</div>
                </Link>
                <div className="mt-2">
                  <SecondaryButton onClick={() => void removeProjectAssignment(a.project.id)}>
                    {l("common.remove")}
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Zukuenftige Projekte ────────────────────────── */}
      {futureAssignments.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold">{l("work.futureProjects")}</h4>
          <div className="grid gap-2">
            {futureAssignments.map((a) => (
              <div key={a.id} className="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                <Link href={`/projects/${a.project.id}`} className="block transition hover:text-sky-600 dark:hover:text-sky-400">
                  <div className="font-medium">{a.project.title}</div>
                  <div className="text-slate-500">{a.project.projectNumber} · ab {a.startDate.slice(0, 10)}</div>
                </Link>
                <div className="mt-2">
                  <SecondaryButton onClick={() => void removeProjectAssignment(a.project.id)}>
                    {l("common.remove")}
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Vergangene Projekte ─────────────────────────── */}
      {pastAssignments.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold text-slate-400">{l("work.pastProjects")}</h4>
          <div className="grid gap-2">
            {pastAssignments.map((a) => (
              <div key={a.id} className="rounded-xl border border-black/5 px-3 py-2 text-sm text-slate-400 dark:border-white/5">
                <Link href={`/projects/${a.project.id}`} className="block transition hover:text-sky-600 dark:hover:text-sky-400">
                  <div className="font-medium">{a.project.title}</div>
                  <div>{a.project.projectNumber} · {formatDateRange(a)}</div>
                </Link>
                <div className="mt-2">
                  <SecondaryButton onClick={() => void removeProjectAssignment(a.project.id)}>
                    {l("common.remove")}
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Arbeitsprotokoll ──────────────────────────────── */}
      <WorkerTimeLog entries={worker.timeEntries ?? []} workerName={`${worker.firstName} ${worker.lastName}`} />

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
        />
      </div>
    </div>
  );
}
