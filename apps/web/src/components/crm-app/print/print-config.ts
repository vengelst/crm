/**
 * Print configurator: shared types, section catalogues, and HTML helpers.
 *
 * The configurator is intentionally agnostic about how individual sections are
 * rendered — each call site (CustomerDetailCard, ProjectDetailCard, ...) owns
 * the rendering of its sections because they have direct access to the data.
 * The configurator only collects the user's selection into a
 * `PrintSelectionPayload` that can later be sent to a server-side bundle
 * endpoint.
 */

export type PrintEntityType = "customer" | "project" | "reports" | "tasks";

export type PrintSelectionPayload = {
  entityType: PrintEntityType;
  entityId?: string;
  sections: string[];
  includeDocuments: boolean;
  documentIds: string[];
};

export type PrintSection = {
  /** Stable identifier persisted in localStorage and sent to the server. */
  key: string;
  /** i18n key for the visible checkbox label. */
  labelKey: string;
};

/**
 * Authoritative catalogue of section keys per entity type.
 * Keep these in sync with the spec — caller may pass a subset to the
 * configurator (e.g., `taskDetail` only when printing a single task).
 */
export const SECTIONS: Record<PrintEntityType, PrintSection[]> = {
  customer: [
    { key: "masterData", labelKey: "print.section.customer.masterData" },
    { key: "branches", labelKey: "print.section.customer.branches" },
    { key: "contacts", labelKey: "print.section.customer.contacts" },
    { key: "projects", labelKey: "print.section.customer.projects" },
    { key: "financials", labelKey: "print.section.customer.financials" },
    { key: "notes", labelKey: "print.section.customer.notes" },
    { key: "documents", labelKey: "print.section.customer.documents" },
  ],
  project: [
    { key: "masterData", labelKey: "print.section.project.masterData" },
    { key: "pricing", labelKey: "print.section.project.pricing" },
    { key: "workers", labelKey: "print.section.project.workers" },
    { key: "financials", labelKey: "print.section.project.financials" },
    { key: "timesheets", labelKey: "print.section.project.timesheets" },
    { key: "notices", labelKey: "print.section.project.notices" },
    { key: "documents", labelKey: "print.section.project.documents" },
  ],
  reports: [
    { key: "kpis", labelKey: "print.section.reports.kpis" },
    { key: "revenuePerCustomer", labelKey: "print.section.reports.revenuePerCustomer" },
    { key: "workerStatus", labelKey: "print.section.reports.workerStatus" },
    { key: "timesheets", labelKey: "print.section.reports.timesheets" },
  ],
  tasks: [
    { key: "filters", labelKey: "print.section.tasks.filters" },
    { key: "openTasks", labelKey: "print.section.tasks.openTasks" },
    { key: "completedTasks", labelKey: "print.section.tasks.completedTasks" },
    { key: "taskDetail", labelKey: "print.section.tasks.taskDetail" },
  ],
};

/** Drop section keys that aren't part of the current catalogue. */
export function filterValidSections(
  entityType: PrintEntityType,
  candidates: string[],
  available?: PrintSection[],
): string[] {
  const allowed = new Set(
    (available ?? SECTIONS[entityType]).map((s) => s.key),
  );
  return candidates.filter((c) => allowed.has(c));
}

/** Default selection when no preference has been stored yet: everything on. */
export function defaultSelection(sections: PrintSection[]): string[] {
  return sections.map((s) => s.key);
}

// ── HTML helpers (reuse openPrintWindow which already provides styles) ──

/** Escape user-supplied content for safe interpolation into HTML strings. */
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Compose only the selected section fragments. Order follows `sections`
 * (i.e., the user's catalogue order, not the click order).
 */
export function composeSelectedHtml(
  sections: string[],
  renderers: Record<string, () => string | null | undefined>,
): string {
  const parts: string[] = [];
  for (const key of sections) {
    const fn = renderers[key];
    if (!fn) continue;
    const fragment = fn();
    if (fragment) parts.push(fragment);
  }
  return parts.join("\n");
}

/**
 * Render the standard "ausgewählte Dokumente"-Liste as HTML. Used by every
 * entity print until the server-side bundle endpoint can attach the actual
 * files. Headline + label come from i18n.
 */
export function renderDocumentList(opts: {
  headline: string;
  emptyLabel: string;
  documents: Array<{ id: string; title?: string | null; originalFilename: string; mimeType: string }>;
  selectedIds: string[];
}): string {
  const selected = opts.documents.filter((d) => opts.selectedIds.includes(d.id));
  if (selected.length === 0) {
    return `<h2>${escapeHtml(opts.headline)}</h2><p class="meta">${escapeHtml(opts.emptyLabel)}</p>`;
  }
  const rows = selected
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.title || d.originalFilename)}</td><td>${escapeHtml(d.originalFilename)}</td><td>${escapeHtml(d.mimeType)}</td></tr>`,
    )
    .join("");
  return `<h2>${escapeHtml(opts.headline)}</h2><table><thead><tr><th>Titel</th><th>Datei</th><th>Typ</th></tr></thead><tbody>${rows}</tbody></table>`;
}
