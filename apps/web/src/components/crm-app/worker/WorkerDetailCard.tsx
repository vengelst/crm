"use client";

import Link from "next/link";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import type { Worker, DocumentItem, DocumentFormState, WorkerTimeStatus } from "../types";
import { cx, formatAddress, mapsUrlFromParts, SectionCard, SecondaryButton, MapLinkButton, PrintButton, openPrintWindow } from "../shared";
import { DocumentPanel } from "../documents";
import { WorkerElapsedTime } from "./WorkerElapsedTime";
import { formatMinutes } from "./format-minutes";
import { WorkerTimeLog } from "./WorkerTimeLog";

export function WorkerDetailCard({
  worker,
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
  worker: Worker;
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
  const [timeStatus, setTimeStatus] = useState<WorkerTimeStatus | null>(null);

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

  const formatDateRange = (a: { startDate: string; endDate?: string | null }) => {
    const s = a.startDate.slice(0, 10);
    const e = a.endDate ? a.endDate.slice(0, 10) : "offen";
    return `${s} bis ${e}`;
  };

  function printWorker() {
    const addr = formatAddress([worker.addressLine1, worker.addressLine2, worker.postalCode, worker.city, worker.country]);
    const projs = allAssignments.map((a) => `<tr><td>${a.project.projectNumber}</td><td>${a.project.title}</td><td>${formatDateRange(a)}</td></tr>`).join("");
    openPrintWindow(`Monteur ${worker.firstName} ${worker.lastName}`, `
      <h1>${worker.firstName} ${worker.lastName}</h1>
      <p class="meta">${worker.workerNumber} · ${worker.active === false ? "deaktiviert" : "aktiv"}</p>
      <h2>Stammdaten</h2>
      <div class="grid">
        <span class="label">Adresse</span><span>${addr || "-"}</span>
        <span class="label">Mobil</span><span>${worker.phoneMobile ?? worker.phone ?? "-"}</span>
        <span class="label">Buero</span><span>${worker.phoneOffice ?? "-"}</span>
        <span class="label">E-Mail</span><span>${worker.email ?? "-"}</span>
        <span class="label">Stundensatz intern</span><span>${worker.internalHourlyRate != null ? worker.internalHourlyRate.toFixed(2) + " EUR/h" : "-"}</span>
      </div>
      ${projs ? `<h2>Projekte</h2><table><thead><tr><th>Nr.</th><th>Titel</th><th>Zeitraum</th></tr></thead><tbody>${projs}</tbody></table>` : ""}
    `);
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
          <div>{formatAddress([worker.addressLine1, worker.addressLine2, worker.postalCode, worker.city, worker.country]) || "Keine Adresse hinterlegt."}</div>
          <div>
            {worker.email ?? "Keine E-Mail"} · Mobil: {worker.phoneMobile ?? worker.phone ?? "-"} ·
            Buero: {worker.phoneOffice ?? "-"}
          </div>
        </div>
      </div>

      {/* ── Arbeitsstatus ──────────────────────────────── */}
      {timeStatus?.hasOpenWork && timeStatus.openEntry ? (
        <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/60 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Arbeitet aktuell</div>
          <div className="font-semibold">{timeStatus.openEntry.projectTitle} ({timeStatus.openEntry.projectNumber})</div>
          <WorkerElapsedTime startedAt={timeStatus.openEntry.startedAt} />
          {timeStatus.todayStats ? (
            <div className="mt-2 text-sm text-slate-500">Heute gesamt: {formatMinutes(timeStatus.todayStats.totalMinutes)}</div>
          ) : null}
        </div>
      ) : timeStatus?.todayStats && timeStatus.todayStats.completedMinutes > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <div className="text-sm text-slate-500">Heute gearbeitet: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{formatMinutes(timeStatus.todayStats.completedMinutes)}</span></div>
        </div>
      ) : null}

      {/* ── Hinweis: nur zukuenftige Projekte ───────────── */}
      {hasOnlyFuture ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/5">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Dieser Monteur hat derzeit kein aktives Projekt. Die Zuordnung beginnt erst in der Zukunft.
            Ein Login per PIN ist trotzdem moeglich.
          </p>
        </div>
      ) : null}

      {/* ── Aktuelle Projekte ───────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Aktuelle Projekte</h4>
        {currentAssignments.length === 0 ? (
          <p className="text-sm text-slate-500">Keine laufenden Projekte.</p>
        ) : (
          <div className="grid gap-2">
            {currentAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/projects/${a.project.id}`}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div className="font-medium">{a.project.title}</div>
                <div className="text-slate-500">{a.project.projectNumber} · {formatDateRange(a)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Zukuenftige Projekte ────────────────────────── */}
      {futureAssignments.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold">Zukuenftige Projekte</h4>
          <div className="grid gap-2">
            {futureAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/projects/${a.project.id}`}
                className="rounded-xl border border-black/10 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
              >
                <div className="font-medium">{a.project.title}</div>
                <div className="text-slate-500">{a.project.projectNumber} · ab {a.startDate.slice(0, 10)}</div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Vergangene Projekte ─────────────────────────── */}
      {pastAssignments.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold text-slate-400">Vergangene Projekte</h4>
          <div className="grid gap-2">
            {pastAssignments.map((a) => (
              <Link
                key={a.id}
                href={`/projects/${a.project.id}`}
                className="rounded-xl border border-black/5 px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800"
              >
                <div className="font-medium">{a.project.title}</div>
                <div>{a.project.projectNumber} · {formatDateRange(a)}</div>
              </Link>
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
