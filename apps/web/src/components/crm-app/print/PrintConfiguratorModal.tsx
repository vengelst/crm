"use client";

import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n-context";
import type { DocumentItem } from "../types";
import { SecondaryButton } from "../shared";
import {
  type PrintEntityType,
  type PrintSection,
  type PrintSelectionPayload,
  SECTIONS,
} from "./print-config";
import { loadPrintPrefs, savePrintPrefs } from "./print-prefs";

export type PrintConfiguratorModalProps = {
  /** Which entity catalogue to use; also the localStorage bucket. */
  entityType: PrintEntityType;
  /** Optional id passed through to the resulting payload (server bundle). */
  entityId?: string;
  /** Visible header (title comes from the caller — usually entity-specific). */
  title: string;
  /** Optional subset of `SECTIONS[entityType]`; defaults to all. */
  availableSections?: PrintSection[];
  /** Documents the user can attach. Pass [] to hide the document picker. */
  documents?: DocumentItem[];
  onClose: () => void;
  /** Called with the user's selection. Caller renders + opens print window. */
  onPrint: (payload: PrintSelectionPayload) => void;
};

/**
 * Pre-print configurator. Loads/saves last selection per entity type via
 * `print-prefs`, then hands the result back to the caller for rendering.
 */
export function PrintConfiguratorModal({
  entityType,
  entityId,
  title,
  availableSections,
  documents = [],
  onClose,
  onPrint,
}: PrintConfiguratorModalProps) {
  const { t: l } = useI18n();
  const sections = useMemo(
    () => availableSections ?? SECTIONS[entityType],
    [availableSections, entityType],
  );

  // Initialise from persistence (sections + includeDocuments). Documents
  // default to "all selected" — preference is intentionally not persisted per
  // document because the document set changes between visits. The modal is
  // mounted fresh per print action, so lazy initial state is sufficient and
  // avoids cascading renders from setState-in-effect.
  const [selectedSections, setSelectedSections] = useState<string[]>(
    () => loadPrintPrefs(entityType, sections).sections,
  );
  const [includeDocuments, setIncludeDocuments] = useState<boolean>(
    () => loadPrintPrefs(entityType, sections).includeDocuments,
  );
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(
    () => documents.map((d) => d.id),
  );

  function toggleSection(key: string, checked: boolean) {
    setSelectedSections((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key),
    );
  }

  function toggleDocument(id: string, checked: boolean) {
    setSelectedDocumentIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((d) => d !== id),
    );
  }

  function selectAllSections() {
    setSelectedSections(sections.map((s) => s.key));
  }

  function deselectAllSections() {
    setSelectedSections([]);
  }

  function handlePrint() {
    const finalDocIds = includeDocuments ? selectedDocumentIds : [];
    savePrintPrefs(entityType, {
      sections: selectedSections,
      includeDocuments,
    });
    onPrint({
      entityType,
      entityId,
      sections: selectedSections,
      includeDocuments,
      documentIds: finalDocIds,
    });
  }

  const showDocumentPicker = documents.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 pb-12" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="print-configurator-title"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="print-configurator-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none"
            aria-label={l("common.close")}
          >
            &times;
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">{l("print.cfg.intro")}</p>

        <div className="mb-4 flex flex-wrap gap-2">
          <SecondaryButton onClick={selectAllSections}>{l("print.cfg.selectAll")}</SecondaryButton>
          <SecondaryButton onClick={deselectAllSections}>{l("print.cfg.deselectAll")}</SecondaryButton>
        </div>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{l("print.cfg.sections")}</h3>
            <div className="grid gap-2">
              {sections.map((section) => {
                const checked = selectedSections.includes(section.key);
                return (
                  <label
                    key={section.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"
                  >
                    <span>{l(section.labelKey)}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleSection(section.key, e.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          </section>

          {showDocumentPicker ? (
            <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
              <label className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
                <span>{l("print.cfg.documents")}</span>
                <input
                  type="checkbox"
                  checked={includeDocuments}
                  onChange={(e) => setIncludeDocuments(e.target.checked)}
                />
              </label>
              {includeDocuments ? (
                <div className="grid gap-2">
                  {documents.map((doc) => {
                    const checked = selectedDocumentIds.includes(doc.id);
                    return (
                      <label
                        key={doc.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{doc.title || doc.originalFilename}</span>
                          <span className="ml-2 text-slate-400">{doc.mimeType}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleDocument(doc.id, e.target.checked)}
                        />
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500">{l("print.cfg.documentsExcluded")}</p>
              )}
            </section>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePrint}
            disabled={selectedSections.length === 0 && !(includeDocuments && selectedDocumentIds.length > 0)}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {l("print.cfg.print")}
          </button>
          <SecondaryButton onClick={onClose}>{l("common.cancel")}</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
