"use client";

import { type Dispatch, type SetStateAction } from "react";
import { useI18n } from "../../../i18n-context";
import type { DocumentFormState, DocumentItem, TimesheetItem } from "../types";
import { SecondaryButton } from "../shared";
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
  onPrintDocument?: (document: DocumentItem) => void;
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
              onApproveDocument={onApproveDocument}
              onRejectDocument={onRejectDocument}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
