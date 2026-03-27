"use client";

import Image from "next/image";
import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type { DocumentItem, DocumentFormState, DocumentPreviewState } from "../types";
import { API_ROOT } from "../types";
import { cx, SecondaryButton, Field, TextArea } from "../shared";
import { DocumentThumbnail } from "./DocumentThumbnail";
import { DrawingEditorModal } from "./DrawingEditorModal";

export function DocumentPanel({
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
  allowDelete = true,
  uploadLabel = "Datei / Bild hochladen",
  onApproveDocument,
  onRejectDocument,
  onSubmitDocument,
}: {
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void;
  allowDelete?: boolean;
  uploadLabel?: string;
  onApproveDocument?: (documentId: string) => void;
  onRejectDocument?: (documentId: string) => void;
  onSubmitDocument?: (documentId: string) => void;
}) {
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [thumbnailErrors, setThumbnailErrors] = useState<Record<string, string>>({});
  const [drawingDraft, setDrawingDraft] = useState<{
    title: string;
    sourceUrl?: string;
    sourceDocumentId?: string;
    description?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    type ThumbnailResult =
      | { kind: "error"; id: string; error: string }
      | { kind: "url"; id: string; url: string }
      | { kind: "ok"; id: string };

    async function loadThumbnails() {
      if (documents.length === 0) {
        if (!cancelled) {
          setThumbnailUrls({});
          setThumbnailErrors({});
        }
        return;
      }
      const results: ThumbnailResult[] = await Promise.all(
        documents.map(async (document): Promise<ThumbnailResult> => {
          const isPreviewable =
            document.mimeType.startsWith("image/") || document.mimeType === "application/pdf";
          try {
            const response = await fetch(`${API_ROOT}/api/documents/${document.id}/download`, {
              headers: authToken
                ? { Authorization: `Bearer ${authToken}` }
                : undefined,
            });

            if (!response.ok) {
              let errorMessage = "Datei nicht verfuegbar";
              try {
                const body = (await response.json()) as { message?: string };
                if (body.message) errorMessage = body.message;
              } catch {
                // not JSON
              }
              return { kind: "error", id: document.id, error: errorMessage };
            }

            if (!isPreviewable) {
              return { kind: "ok", id: document.id };
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            createdUrls.push(url);
            return { kind: "url", id: document.id, url };
          } catch {
            return { kind: "error", id: document.id, error: "Datei nicht verfuegbar" };
          }
        }),
      );

      if (cancelled) {
        createdUrls.forEach((url) => window.URL.revokeObjectURL(url));
        return;
      }

      const nextUrls: Record<string, string> = {};
      const nextErrors: Record<string, string> = {};
      for (const result of results) {
        if (result.kind === "error") {
          nextErrors[result.id] = result.error;
        } else if (result.kind === "url") {
          nextUrls[result.id] = result.url;
        }
      }
      setThumbnailUrls(nextUrls);
      setThumbnailErrors(nextErrors);
    }

    void loadThumbnails();

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => window.URL.revokeObjectURL(url));
    };
  }, [authToken, documents]);

  return (
    <div className="grid gap-4">
      <h4 className="text-base font-semibold">Dokumente und Bilder</h4>
      <div className="grid gap-2">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Dokumente vorhanden.</p>
        ) : (
          documents.map((document) => {
            const fileError = thumbnailErrors[document.id];
            const uploaderLabel = document.uploadedByWorker
              ? `${document.uploadedByWorker.firstName} ${document.uploadedByWorker.lastName} (${document.uploadedByWorker.workerNumber})`
              : document.uploadedBy?.displayName || document.uploadedBy?.email || null;
            return (
              <div
                key={document.id}
                className={cx(
                  "flex flex-col gap-2 rounded-2xl border p-3 lg:flex-row lg:items-center lg:justify-between",
                  fileError
                    ? "border-amber-300 bg-amber-50/50 dark:border-amber-500/40 dark:bg-amber-500/5"
                    : "border-black/10 dark:border-white/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <DocumentThumbnail
                    document={document}
                    thumbnailUrl={thumbnailUrls[document.id]}
                    hasError={Boolean(fileError)}
                  />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenDocument(document)}
                      className="text-left font-medium hover:underline"
                    >
                      {document.title || document.originalFilename}
                    </button>
                    <div className="text-sm text-slate-500">
                      {document.documentType} · {document.mimeType}
                    </div>
                    {uploaderLabel ? (
                      <div className="text-xs text-slate-500">
                        Hochgeladen von: {uploaderLabel}
                      </div>
                    ) : null}
                    {document.approvalStatus && document.approvalStatus !== "DRAFT" ? (
                      <span className={cx("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        document.approvalStatus === "SUBMITTED" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" :
                        document.approvalStatus === "APPROVED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                        document.approvalStatus === "REJECTED" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" :
                        document.approvalStatus === "ARCHIVED" ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {document.approvalStatus === "SUBMITTED" ? "Eingereicht" :
                         document.approvalStatus === "APPROVED" ? "Freigegeben" :
                         document.approvalStatus === "REJECTED" ? "Abgelehnt" :
                         document.approvalStatus === "ARCHIVED" ? "Archiviert" :
                         document.approvalStatus}
                      </span>
                    ) : null}
                    {fileError ? (
                      <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {fileError}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton onClick={() => onOpenDocument(document)}>
                    Anzeigen
                  </SecondaryButton>
                  <SecondaryButton onClick={() => onPrintDocument(document)}>Drucken</SecondaryButton>
                  <SecondaryButton
                    onClick={() => onDownload(document.id, document.originalFilename)}
                  >
                    Download
                  </SecondaryButton>
                  {document.mimeType.startsWith("image/") && thumbnailUrls[document.id] ? (
                    <SecondaryButton
                      onClick={() =>
                        setDrawingDraft({
                          title: `${document.title || document.originalFilename} - Anmerkung`,
                          sourceUrl: thumbnailUrls[document.id],
                          sourceDocumentId: document.id,
                          description: `Anmerkung zu ${document.title || document.originalFilename}`,
                        })
                      }
                    >
                      Anmerken
                    </SecondaryButton>
                  ) : null}
                  {onSubmitDocument && (!document.approvalStatus || document.approvalStatus === "DRAFT" || document.approvalStatus === "REJECTED") ? (
                    <SecondaryButton onClick={() => onSubmitDocument(document.id)}>Einreichen</SecondaryButton>
                  ) : null}
                  {onApproveDocument && document.approvalStatus === "SUBMITTED" ? (
                    <SecondaryButton onClick={() => onApproveDocument(document.id)}>Freigeben</SecondaryButton>
                  ) : null}
                  {onRejectDocument && document.approvalStatus === "SUBMITTED" ? (
                    <SecondaryButton onClick={() => onRejectDocument(document.id)}>Ablehnen</SecondaryButton>
                  ) : null}
                  {allowDelete ? (
                    <SecondaryButton onClick={() => onDeleteDocument(document.id)}>
                      Loeschen
                    </SecondaryButton>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="grid gap-3 rounded-2xl border border-black/10 p-3 dark:border-white/10">
        <Field
          label="Titel"
          value={documentForm.title}
          onChange={(event) =>
            setDocumentForm((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
        <Field
          label="Typ"
          value={documentForm.documentType}
          onChange={(event) =>
            setDocumentForm((current) => ({
              ...current,
              documentType: event.target.value,
            }))
          }
        />
        <TextArea
          label="Beschreibung"
          value={documentForm.description}
          onChange={(event) =>
            setDocumentForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
        <div className="grid gap-2">
          <label className="text-sm font-medium">Datei oder Bild</label>
          <input
            type="file"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            capture="environment"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDocumentForm((current) => ({
                ...current,
                file: event.target.files?.[0] ?? null,
              }))
            }
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"
          />
          <p className="text-xs text-slate-500">
            Auf dem Handy koennen Bilder direkt mit der Kamera aufgenommen werden.
          </p>
        </div>
        <div>
          <SecondaryButton onClick={onUpload}>{uploadLabel}</SecondaryButton>
        </div>
        <div>
          <SecondaryButton
            onClick={() =>
              setDrawingDraft({
                title: "Neue Zeichnung",
                description: "Freihandzeichnung",
              })
            }
          >
            Zeichnung erstellen
          </SecondaryButton>
        </div>
      </div>
      {drawingDraft ? (
        <DrawingEditorModal
          title={drawingDraft.title}
          sourceUrl={drawingDraft.sourceUrl}
          sourceDocumentId={drawingDraft.sourceDocumentId}
          onClose={() => setDrawingDraft(null)}
          onSave={(file, mode) => {
            if (mode === "replace" && drawingDraft.sourceDocumentId) {
              // Original ersetzen: per fetch direkt an Backend
              const fd = new FormData();
              fd.append("file", file);
              void fetch(`${API_ROOT}/api/documents/${drawingDraft.sourceDocumentId}/replace`, {
                method: "PUT",
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
                body: fd,
              }).then(() => {
                setDrawingDraft(null);
                onUpload(); // Neu laden
              });
            } else {
              // Als Kopie: in Formular uebernehmen
              setDocumentForm((current) => ({
                ...current,
                title: current.title || drawingDraft.title,
                description: current.description || drawingDraft.description || "",
                file,
              }));
              setDrawingDraft(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
