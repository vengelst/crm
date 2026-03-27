"use client";

import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { Project, TimesheetItem, DocumentItem, DocumentFormState, DocumentPreviewState } from "../types";
import { t, type SupportedLang } from "../../../i18n";
import { cx, SecondaryButton, formatAddress } from "../shared";
import { DocumentPanel, DocumentPreviewModal } from "../documents";
import { ProjectChecklistSection } from "./ProjectChecklistSection";
import { ProjectNoticesSection } from "./ProjectNoticesSection";

const emptyDocumentForm = (): DocumentFormState => ({ title: "", description: "", documentType: "", file: null });

export function KioskProjectView({ project, timesheets, apiFetch, workerId, authToken, lang = "de" as SupportedLang }: {
  project: Project;
  timesheets: TimesheetItem[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  workerId: string;
  authToken: string;
  lang?: SupportedLang;
}) {
  const l = (key: string) => t(key, lang);
  // Nur eigene, aktuelle (nicht abgeschlossene) Stundenzettel
  const myCurrentTimesheets = timesheets.filter((ts) =>
    ts.worker?.id === workerId &&
    ts.status !== "COMPLETED" &&
    ts.status !== "LOCKED",
  );

  // Dokumente fuer dieses Projekt laden
  const [projectDocs, setProjectDocs] = useState<DocumentItem[]>([]);
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docMsg, setDocMsg] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<DocumentItem[]>(`/documents?entityType=PROJECT&entityId=${project.id}`).then(setProjectDocs).catch(() => {});
  }, [apiFetch, project.id]);

  async function uploadDoc() {
    if (!documentForm.file) return;
    setUploading(true); setDocMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", documentForm.file);
      fd.append("documentType", documentForm.documentType || "PROJEKTDOKUMENT");
      fd.append("title", documentForm.title);
      fd.append("description", documentForm.description);
      fd.append("entityType", "PROJECT");
      fd.append("entityId", project.id);
      await apiFetch("/documents/upload", { method: "POST", body: fd, headers: {} });
      setDocMsg(l("kiosk.uploaded"));
      setDocumentForm(emptyDocumentForm());
      const docs = await apiFetch<DocumentItem[]>(`/documents?entityType=PROJECT&entityId=${project.id}`);
      setProjectDocs(docs);
    } catch (e) { setDocMsg(e instanceof Error ? e.message : l("kiosk.uploadFailed")); }
    finally { setUploading(false); }
  }

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

  async function fetchDocumentBlob(documentId: string) {
    const response = await fetch(`${apiRoot}/api/documents/${documentId}/download`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    });
    if (!response.ok) {
      let message = l("kiosk.docLoadFailed");
      const rawBody = await response.text();
      if (rawBody.trim()) {
        try {
          const body = JSON.parse(rawBody) as { message?: string | string[] };
          const parsed = Array.isArray(body.message) ? body.message.join(", ") : body.message;
          if (parsed) message = parsed;
        } catch {
          message = rawBody;
        }
      }
      throw new Error(message);
    }
    return response.blob();
  }

  async function openDocument(document: DocumentItem) {
    try {
      const blob = await fetchDocumentBlob(document.id);
      const url = window.URL.createObjectURL(blob);
      setDocumentPreview((current) => {
        if (current?.url) {
          window.URL.revokeObjectURL(current.url);
        }
        return {
          documentId: document.id,
          url,
          mimeType: document.mimeType,
          title: document.title || document.originalFilename,
        };
      });
    } catch (e) {
      setDocMsg(e instanceof Error ? e.message : l("kiosk.docLoadFailed"));
    }
  }

  async function printDocument(document: DocumentItem) {
    try {
      const blob = await fetchDocumentBlob(document.id);
      if (blob.type.startsWith("image/")) {
        const url = window.URL.createObjectURL(blob);
        const win = window.open("", "_blank", "width=1000,height=800");
        if (!win) return;
        win.document.write(`<!DOCTYPE html><html><head><title>Bild drucken</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; }
  body { display: flex; align-items: center; justify-content: center; }
  img { width: 100vw; height: 100vh; object-fit: contain; }
</style></head><body><img src="${url}" alt="Druckbild" /></body></html>`);
        win.document.close();
        win.setTimeout(() => {
          win.print();
          window.setTimeout(() => {
            window.URL.revokeObjectURL(url);
          }, 2000);
        }, 300);
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const iframe = window.document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        window.setTimeout(() => {
          window.URL.revokeObjectURL(url);
          iframe.remove();
        }, 2000);
      };
      window.document.body.appendChild(iframe);
    } catch (e) {
      setDocMsg(e instanceof Error ? e.message : l("kiosk.printFailed"));
    }
  }

  async function printDocumentById(documentId: string) {
    const document = projectDocs.find((item) => item.id === documentId);
    if (!document) {
      setDocMsg(l("kiosk.docNotFound"));
      return;
    }
    await printDocument(document);
  }

  async function downloadDocument(documentId: string, filename: string) {
    try {
      const blob = await fetchDocumentBlob(documentId);
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setDocMsg(e instanceof Error ? e.message : l("kiosk.downloadFailed"));
    }
  }

  return (
    <div className="grid gap-5">
      {/* Stammdaten */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h3 className="text-lg font-semibold">{project.title}</h3>
        <p className="text-sm text-slate-500">{project.projectNumber} · {project.customer?.companyName ?? "-"}</p>
        <div className="mt-2 grid gap-1 text-sm text-slate-500">
          <div>{project.status ?? "-"}</div>
          <div>{formatAddress([project.siteAddressLine1, project.sitePostalCode, project.siteCity, project.siteCountry]) || l("kiosk.noProjectAddress")}</div>
          {project.description ? <div className="mt-1">{project.description}</div> : null}
          {project.plannedStartDate ? (
            <div>{l("kiosk.period")} {project.plannedStartDate.slice(0, 10)} {l("worker.to")} {project.plannedEndDate?.slice(0, 10) ?? l("worker.open")}</div>
          ) : null}
        </div>
      </div>

      {/* Team / zugeordnete Monteure */}
      {(project.assignments ?? []).length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-2 text-sm font-semibold">{l("kiosk.myTeam")}</h4>
          <div className="flex flex-wrap gap-2">
            {(project.assignments ?? []).map((a) => (
              <span key={a.id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-slate-800">
                {a.worker.firstName} {a.worker.lastName}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Projektdokumente (kein Loeschen fuer Monteur) */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-sm font-semibold">{l("kiosk.projectDocs")}</h4>
        {docMsg ? <div className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{docMsg}</div> : null}
        <DocumentPanel
          documents={projectDocs}
          onOpenDocument={(document) => void openDocument(document)}
          onPrintDocument={(document) => void printDocument(document)}
          onDownload={downloadDocument}
          onDeleteDocument={() => {}}
          documentForm={documentForm}
          setDocumentForm={setDocumentForm}
          authToken={authToken}
          onUpload={() => void uploadDoc()}
          allowDelete={false}
          uploadLabel={uploading ? l("kiosk.uploading") : l("kiosk.uploadDoc")}
          onSubmitDocument={(docId) => void apiFetch(`/documents/${docId}/submit`, { method: "POST", body: JSON.stringify({}) }).then(() => { setDocMsg(l("kiosk.docSubmitted")); }).catch(() => { setDocMsg(l("kiosk.docSubmitFailed")); })}
        />
      </div>

      {/* Nur eigener aktueller Stundenzettel (nicht abgeschlossene) */}
      {myCurrentTimesheets.length > 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-sm font-semibold">{l("kiosk.myTimesheet")}</h4>
          <div className="grid gap-2">
            {myCurrentTimesheets.map((ts) => (
              <div key={ts.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="font-medium">KW {ts.weekNumber} / {ts.weekYear}</div>
                <div className="text-xs text-slate-500">
                  {Math.floor(ts.totalMinutesNet / 60)}h {ts.totalMinutesNet % 60}m {l("kiosk.net")} ·
                  {ts.status === "DRAFT" ? ` ${l("ts.draft")}` : ts.status === "WORKER_SIGNED" ? ` ${l("ts.workerSigned")}` : ` ${ts.status}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {/* Checklisten (Monteur-Sicht) */}
      <ProjectChecklistSection projectId={project.id} apiFetch={apiFetch} isAdmin={false} />

      {/* Baustellenhinweise (Monteur-Sicht) */}
      <ProjectNoticesSection projectId={project.id} apiFetch={apiFetch} isAdmin={false} workerId={workerId} />

      {documentPreview ? (
        <DocumentPreviewModal
          preview={documentPreview}
          onPrint={() => void printDocumentById(documentPreview.documentId)}
          onClose={() => {
            if (documentPreview.url) {
              window.URL.revokeObjectURL(documentPreview.url);
            }
            setDocumentPreview(null);
          }}
        />
      ) : null}
    </div>
  );
}


// OpenWorkCard, TodayStatsBar, formatMinutes, WorkerElapsedTime moved to ./crm-app/worker/


// ── Kiosk-User-View (Projektleiter Kunde) ──────────────────
