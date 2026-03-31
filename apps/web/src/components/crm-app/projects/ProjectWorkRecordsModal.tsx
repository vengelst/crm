"use client";

import { type ChangeEvent, type Dispatch, type SetStateAction, useState } from "react";
import { useI18n } from "../../../i18n-context";
import type { DocumentFormState, DocumentItem, TimesheetItem } from "../types";
import { SecondaryButton, Field, TextArea } from "../shared";
import { DocumentPanel } from "../documents";
import { TimesheetList } from "./TimesheetList";

export function ProjectWorkRecordsModal({
  onClose,
  timesheets,
  apiFetch,
  onRefreshTimesheets,
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
  onApproveDocument,
  onRejectDocument,
}: {
  onClose: () => void;
  timesheets: TimesheetItem[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onRefreshTimesheets: () => Promise<void>;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void | Promise<void>;
  onApproveDocument: (docId: string) => void;
  onRejectDocument: (docId: string) => void;
}) {
  const { t: l } = useI18n();
  const [newDocOpen, setNewDocOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pb-12 pt-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-4 w-full max-w-4xl rounded-2xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="work-records-modal-title"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 id="work-records-modal-title" className="text-lg font-semibold">
            {l("proj.workRecordsModalTitle")}
          </h2>
          <SecondaryButton onClick={onClose}>{l("common.close")}</SecondaryButton>
        </div>

        <div className="grid max-h-[min(75vh,720px)] gap-6 overflow-y-auto pr-1">
          <section>
            <TimesheetList
              timesheets={timesheets}
              apiFetch={apiFetch}
              title={l("ts.title")}
              signatureDisplay="detail"
              onAfterTimesheetChange={onRefreshTimesheets}
            />
          </section>

          <section className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{l("doc.docsTitle")}</h3>
              <SecondaryButton onClick={() => setNewDocOpen(true)}>
                {l("doc.newDocument")}
              </SecondaryButton>
            </div>
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
              hideInlineUpload
              onApproveDocument={onApproveDocument}
              onRejectDocument={onRejectDocument}
            />
          </section>
        </div>

        {newDocOpen ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setNewDocOpen(false)}
            role="presentation"
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-3 text-base font-semibold">{l("doc.newDocument")}</h3>
              <div className="grid gap-3">
                <Field
                  label={l("doc.title")}
                  value={documentForm.title}
                  onChange={(event) =>
                    setDocumentForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                <Field
                  label={l("doc.type")}
                  value={documentForm.documentType}
                  onChange={(event) =>
                    setDocumentForm((current) => ({
                      ...current,
                      documentType: event.target.value,
                    }))
                  }
                />
                <TextArea
                  label={l("doc.description")}
                  value={documentForm.description}
                  onChange={(event) =>
                    setDocumentForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
                <div className="grid gap-2">
                  <label className="text-sm font-medium">{l("doc.fileOrImage")}</label>
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
                  <p className="text-xs text-slate-500">{l("doc.cameraHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton
                    onClick={async () => {
                      if (!documentForm.file) return;
                      try {
                        await Promise.resolve(onUpload());
                        setNewDocOpen(false);
                      } catch {
                        /* Fehler zeigt runMutation / Parent */
                      }
                    }}
                  >
                    {l("doc.upload")}
                  </SecondaryButton>
                  <SecondaryButton onClick={() => setNewDocOpen(false)}>
                    {l("common.cancel")}
                  </SecondaryButton>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
