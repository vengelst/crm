"use client";

import { useI18n } from "../../../i18n-context";
import Link from "next/link";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type {
  Customer, Project, CustomerFinancials, DocumentItem,
  DocumentFormState, TimesheetItem,
} from "../types";
import { CollapsibleContent, CollapseIndicator, cx, formatAddress, mapsUrlFromParts, MapLinkButton, PrintButton, openPrintWindow } from "../shared";
import { DocumentPanel } from "../documents";
import { TimesheetList, FinancialKpi } from "../projects";
import { InlineNotesSection } from "../notes";
import { EmbeddedRemindersSection } from "../reminders";
import {
  PrintConfiguratorModal,
  composeSelectedHtml,
  escapeHtml,
  type PrintSelectionPayload,
  renderDocumentList,
} from "../print";

export function CustomerDetailCard({
  customer,
  customerProjects,
  financials,
  documents,
  onOpenDocument,
  onPrintDocument,
  onDownload,
  onDeleteDocument,
  documentForm,
  setDocumentForm,
  authToken,
  onUpload,
  onEdit,
  onAddPrimaryContact,
  onAddBranch,
  onEditContacts,
  onCreateProject,
  canPrint = true,
  apiFetch,
  currentUserId,
  onRemindersChanged,
}: {
  customer: Customer;
  customerProjects: Project[];
  financials: CustomerFinancials | null;
  documents: DocumentItem[];
  onOpenDocument: (document: DocumentItem) => void;
  onPrintDocument?: (document: DocumentItem) => void;
  onDownload: (documentId: string, filename: string) => void;
  onDeleteDocument: (documentId: string) => void;
  documentForm: DocumentFormState;
  setDocumentForm: Dispatch<SetStateAction<DocumentFormState>>;
  authToken: string;
  onUpload: () => void | Promise<void>;
  onEdit?: () => void;
  /** Quick-Action: oeffnet Edit-Modal mit neuem Kontakt vorbereitet (als Hauptkontakt). */
  onAddPrimaryContact?: () => void;
  /** Quick-Action: oeffnet Edit-Modal mit neuem Standort vorbereitet. */
  onAddBranch?: () => void;
  /** Quick-Action: oeffnet Edit-Modal direkt im Ansprechpartner-Tab. */
  onEditContacts?: () => void;
  /** Quick-Action: navigiert zur Projektanlage fuer diesen Kunden. */
  onCreateProject?: () => void;
  canPrint?: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Aktueller Nutzer als Default-Verantwortlicher fuer neue Wiedervorlagen. */
  currentUserId?: string;
  /** Wird aufgerufen, wenn sich die Reminder-Counts geaendert haben. */
  onRemindersChanged?: () => void;
}) {
  const { t: l } = useI18n();
  const [customerTimesheets, setCustomerTimesheets] = useState<TimesheetItem[]>([]);
  const [reportsOpen, setReportsOpen] = useState(false);

  useEffect(() => {
    async function loadTs() {
      const all: TimesheetItem[] = [];
      for (const p of customerProjects) {
        try {
          const ts = await apiFetch<TimesheetItem[]>(`/timesheets/weekly?projectId=${p.id}`);
          all.push(...ts);
        } catch { /* skip */ }
      }
      setCustomerTimesheets(all);
    }
    void loadTs();
  }, [apiFetch, customerProjects]);

  const customerMapsUrl = mapsUrlFromParts([
    customer.companyName,
    customer.addressLine1,
    customer.addressLine2,
    customer.postalCode,
    customer.city,
    customer.country,
  ]);

  const statusLabel = (status?: string) => {
    if (!status) return "-";
    return l(`status.${status}`) !== `status.${status}` ? l(`status.${status}`) : status;
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case "ACTIVE": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
      case "COMPLETED": return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300";
      case "PAUSED": return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300";
      case "CANCELED": return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300";
      default: return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    }
  };

  const customerReminderHref = `/settings?tab=reminders&kind=FOLLOW_UP&customerId=${encodeURIComponent(customer.id)}&title=${encodeURIComponent(`${l("reminder.prefixFollowUp")} ${customer.companyName}`)}`;

  const [showPrintConfig, setShowPrintConfig] = useState(false);

  function buildSectionRenderers(): Record<string, () => string> {
    const fmtAddr = formatAddress([
      customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country,
    ]);
    return {
      masterData: () => `<h2>${escapeHtml(l("print.masterData"))}</h2>
        <div class="grid">
          <span class="label">${escapeHtml(l("print.address"))}</span><span>${escapeHtml(fmtAddr || "-")}</span>
          <span class="label">${escapeHtml(l("print.phone"))}</span><span>${escapeHtml(customer.phone ?? "-")}</span>
          <span class="label">${escapeHtml(l("print.email"))}</span><span>${escapeHtml(customer.email ?? "-")}</span>
          <span class="label">${escapeHtml(l("print.website"))}</span><span>${escapeHtml(customer.website ?? "-")}</span>
          <span class="label">${escapeHtml(l("print.vatId"))}</span><span>${escapeHtml(customer.vatId ?? "-")}</span>
        </div>`,
      branches: () => {
        if (customer.branches.length === 0) return "";
        const rows = customer.branches
          .map((b) => `<tr><td>${escapeHtml(b.name)}</td><td>${escapeHtml(formatAddress([b.addressLine1, b.postalCode, b.city]))}</td><td>${escapeHtml(b.phone ?? "-")}</td><td>${escapeHtml(b.email ?? "-")}</td></tr>`)
          .join("");
        return `<h2>${escapeHtml(l("cust.branches"))}</h2><table><thead><tr><th>${escapeHtml(l("print.name"))}</th><th>${escapeHtml(l("print.address"))}</th><th>${escapeHtml(l("print.phone"))}</th><th>${escapeHtml(l("print.email"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      },
      contacts: () => {
        if (customer.contacts.length === 0) return "";
        const rows = customer.contacts
          .map((c) => `<tr><td>${escapeHtml(`${c.firstName} ${c.lastName}`)}</td><td>${escapeHtml(c.role ?? "-")}</td><td>${escapeHtml(c.phoneMobile ?? "-")}</td><td>${escapeHtml(c.email ?? "-")}</td></tr>`)
          .join("");
        return `<h2>${escapeHtml(l("cust.contacts"))}</h2><table><thead><tr><th>${escapeHtml(l("print.name"))}</th><th>${escapeHtml(l("print.role"))}</th><th>${escapeHtml(l("print.mobile"))}</th><th>${escapeHtml(l("print.email"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      },
      projects: () => {
        if (customerProjects.length === 0) return "";
        const rows = customerProjects
          .map((p) => `<tr><td>${escapeHtml(p.projectNumber)}</td><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.status ?? "-")}</td></tr>`)
          .join("");
        return `<h2>${escapeHtml(l("cust.currentProjects"))}</h2><table><thead><tr><th>${escapeHtml(l("table.nr"))}</th><th>${escapeHtml(l("table.title"))}</th><th>${escapeHtml(l("table.status"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      },
      financials: () => {
        if (!financials) return "";
        return `<h2>${escapeHtml(l("reports.title"))}</h2>
          <div class="grid">
            <span class="label">${escapeHtml(l("kpi.totalHours"))}</span><span>${escapeHtml(`${financials.totalHours} h`)}</span>
            <span class="label">${escapeHtml(l("kpi.totalRevenue"))}</span><span>${escapeHtml(`${financials.totalRevenue.toFixed(2)} EUR`)}</span>
            <span class="label">${escapeHtml(l("kpi.workerCosts"))}</span><span>${escapeHtml(`${financials.totalCosts.toFixed(2)} EUR`)}</span>
            <span class="label">${escapeHtml(l("kpi.margin"))}</span><span>${escapeHtml(`${financials.margin.toFixed(2)} EUR`)}</span>
          </div>`;
      },
      notes: () => (customer.notes ? `<h2>${escapeHtml(l("print.notes"))}</h2><p>${escapeHtml(customer.notes)}</p>` : ""),
      documents: () => "", // handled separately by composeFinalHtml below
    };
  }

  function handleConfiguredPrint(payload: PrintSelectionPayload) {
    const renderers = buildSectionRenderers();
    const sectionsExceptDocuments = payload.sections.filter((s) => s !== "documents");
    let html = `<h1>${escapeHtml(customer.companyName)}</h1>
      <p class="meta">${escapeHtml(customer.customerNumber)} · ${escapeHtml(customer.status ?? "")}</p>`;
    html += composeSelectedHtml(sectionsExceptDocuments, renderers);
    if (payload.sections.includes("documents") && payload.includeDocuments) {
      html += renderDocumentList({
        headline: l("print.section.customer.documents"),
        emptyLabel: l("print.cfg.noDocumentsSelected"),
        documents,
        selectedIds: payload.documentIds,
      });
    }
    openPrintWindow(`${l("print.customer")} ${customer.companyName}`, html);
    setShowPrintConfig(false);
  }

  // Hauptkontakt-Heuristik: bevorzuge Projektkontakt, fallback auf erste Person.
  const primaryContact =
    customer.contacts.find((c) => c.isProjectContact) ?? customer.contacts[0] ?? null;

  // Sortiere Ansprechpartner so, dass markierte Rollen oben stehen.
  const sortedContacts = [...customer.contacts].sort((a, b) => {
    const score = (c: typeof a) =>
      (c.isProjectContact ? 4 : 0) +
      (c.isSignatory ? 2 : 0) +
      (c.isAccountingContact ? 1 : 0);
    return score(b) - score(a);
  });

  return (
    <div className="grid gap-5">
      {/* ── Header / Kompaktansicht ────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{customer.companyName}</h3>
            <p className="text-sm text-slate-500">
              {customer.customerNumber}
              {customer.status ? (
                <span className={cx("ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium align-middle", statusColor(customer.status))}>
                  {statusLabel(customer.status)}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {customerMapsUrl ? <MapLinkButton href={customerMapsUrl}>{l("common.googleMaps")}</MapLinkButton> : null}
            <Link href={customerReminderHref} className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
              {l("settings.remindersQuickCreate")}
            </Link>
            {canPrint ? <PrintButton onClick={() => setShowPrintConfig(true)} label={l("cust.printSheet")} /> : null}
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M2.695 14.762l-1.262 3.155a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.886L17.5 5.501a2.121 2.121 0 00-3-3L3.58 13.419a4 4 0 00-.885 1.343z" />
                </svg>
                {l("common.edit")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
          <div className="grid gap-1">
            <div>{formatAddress([customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country]) || l("cust.noAddress")}</div>
            <div>
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a>
              ) : (
                l("common.noEmail")
              )}
              {" · "}
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>
              ) : (
                l("common.noPhone")
              )}
            </div>
          </div>
          {primaryContact ? (
            <div className="grid gap-1 sm:justify-self-end sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {l("cust.headerMainContact")}
              </div>
              <div className="font-medium text-slate-700 dark:text-slate-200">
                {primaryContact.firstName} {primaryContact.lastName}
                {primaryContact.role ? <span className="ml-2 text-xs text-slate-400">({primaryContact.role})</span> : null}
              </div>
              <div className="text-sm">
                {primaryContact.email ? (
                  <a href={`mailto:${primaryContact.email}`} className="hover:underline">{primaryContact.email}</a>
                ) : null}
                {primaryContact.email && primaryContact.phoneMobile ? " · " : null}
                {primaryContact.phoneMobile ? (
                  <a href={`tel:${primaryContact.phoneMobile}`} className="hover:underline">{primaryContact.phoneMobile}</a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid gap-1 sm:justify-self-end sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {l("cust.headerMainContact")}
              </div>
              <div className="text-sm text-slate-400">{l("cust.headerNoContact")}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Naechste Schritte (Quick-Actions) ──────────────────── */}
      {(onAddPrimaryContact || onAddBranch || onCreateProject || onEdit) ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-500/30 dark:bg-blue-500/5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            {l("cust.afterCreateHeading")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {onAddPrimaryContact && !primaryContact ? (
              <button
                type="button"
                onClick={onAddPrimaryContact}
                className="rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {l("cust.nextAddPrimaryContact")}
              </button>
            ) : null}
            {onAddBranch ? (
              <button
                type="button"
                onClick={onAddBranch}
                className="rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {l("cust.nextAddBranch")}
              </button>
            ) : null}
            {onCreateProject ? (
              <button
                type="button"
                onClick={onCreateProject}
                className="rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {l("cust.nextAddProject")}
              </button>
            ) : null}
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {l("cust.nextEditMore")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Standorte / Niederlassungen (sekundaer) ────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold">{l("cust.sectionLocations")}</h4>
          {onAddBranch ? (
            <button
              type="button"
              onClick={onAddBranch}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {l("cust.addBranch")}
            </button>
          ) : null}
        </div>
        <p className="mb-3 text-xs text-slate-500">{l("cust.sectionLocationsHint")}</p>
        {customer.branches.length === 0 ? (
          <p className="text-sm text-slate-500">{l("cust.locationsEmpty")}</p>
        ) : (
          <div className="grid gap-2">
            {customer.branches.map((branch, index) => {
              const branchMapsUrl = mapsUrlFromParts([
                branch.name,
                branch.addressLine1,
                branch.addressLine2,
                branch.postalCode,
                branch.city,
                branch.country,
              ]);

              return (
                <div
                  key={`${branch.id ?? branch.name}-${index}`}
                  className="grid gap-2 rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="font-medium">{branch.name}</div>
                    {branchMapsUrl ? (
                      <MapLinkButton href={branchMapsUrl}>{l("common.googleMaps")}</MapLinkButton>
                    ) : null}
                  </div>
                  <div className="text-sm text-slate-500">
                    {formatAddress([
                      branch.addressLine1,
                      branch.addressLine2,
                      branch.postalCode,
                      branch.city,
                      branch.country,
                    ]) || l("common.noAddress")}
                  </div>
                  <div className="text-sm text-slate-500">
                    {branch.phone || l("common.noPhone")} · {branch.email || l("common.noEmail")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Ansprechpartner: Zentral + je Standort ─────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold">{l("cust.sectionContacts")}</h4>
          {onAddPrimaryContact || onEditContacts ? (
            <button
              type="button"
              onClick={onAddPrimaryContact ?? onEditContacts}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {l("cust.addContact")}
            </button>
          ) : null}
        </div>
        {sortedContacts.length === 0 ? (
          <p className="text-sm text-slate-500">{l("cust.noContacts")}</p>
        ) : (
          <div className="grid gap-4">
            {/* Zentrale Ansprechpartner: ohne Standortzuordnung */}
            <div>
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("cust.centralContactsHeading")}</h5>
              {sortedContacts.filter((c) => !c.branchId && !c.branchName).length === 0 ? (
                <p className="text-xs text-slate-500">{l("cust.centralContactsEmpty")}</p>
              ) : (
                <div className="grid gap-2">
                  {sortedContacts
                    .filter((c) => !c.branchId && !c.branchName)
                    .map((contact, index) => (
                      <ContactCardWithNotes
                        key={`central-${contact.id ?? `${contact.firstName}-${contact.lastName}`}-${index}`}
                        contact={contact}
                        customerId={customer.id}
                        availableProjects={customerProjects}
                        apiFetch={apiFetch}
                        isPrimary={primaryContact != null && contact === primaryContact}
                        scopeLabel={l("cust.contactScopeCentral")}
                      />
                    ))}
                </div>
              )}
            </div>

            {/* Standortbezogene Ansprechpartner je Standort */}
            {customer.branches.map((branch) => {
              const branchContacts = sortedContacts.filter(
                (c) =>
                  (branch.id && c.branchId === branch.id) ||
                  (!branch.id && branch.name && c.branchName === branch.name),
              );
              if (branchContacts.length === 0) return null;
              return (
                <div key={`bg-${branch.id ?? branch.name}`}>
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {l("cust.branchContactsHeading")}: {branch.name || l("cust.branchName")}
                  </h5>
                  <div className="grid gap-2">
                    {branchContacts.map((contact, index) => (
                      <ContactCardWithNotes
                        key={`${branch.id ?? branch.name}-${contact.id ?? `${contact.firstName}-${contact.lastName}`}-${index}`}
                        contact={contact}
                        customerId={customer.id}
                        availableProjects={customerProjects}
                        apiFetch={apiFetch}
                        isPrimary={primaryContact != null && contact === primaryContact}
                        scopeLabel={l("cust.contactScopeBranch")}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Kontakte mit unbekannter / verwaister Standortzuordnung */}
            {(() => {
              const orphans = sortedContacts.filter((c) => {
                if (!c.branchId && !c.branchName) return false;
                const matchedBranch = customer.branches.some(
                  (b) =>
                    (b.id && c.branchId === b.id) ||
                    (!b.id && b.name && c.branchName === b.name),
                );
                return !matchedBranch;
              });
              if (orphans.length === 0) return null;
              return (
                <div>
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {l("cust.branchContactsHeading")}: {orphans[0].branchName ?? "?"}
                  </h5>
                  <div className="grid gap-2">
                    {orphans.map((contact, index) => (
                      <ContactCardWithNotes
                        key={`orphan-${contact.id ?? `${contact.firstName}-${contact.lastName}`}-${index}`}
                        contact={contact}
                        customerId={customer.id}
                        availableProjects={customerProjects}
                        apiFetch={apiFetch}
                        isPrimary={primaryContact != null && contact === primaryContact}
                        scopeLabel={l("cust.contactScopeBranch")}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Wiedervorlagen (FOLLOW_UP) ─────────────────────────── */}
      {currentUserId ? (
        <EmbeddedRemindersSection
          scope={{ kind: "customer", customerId: customer.id }}
          apiFetch={apiFetch}
          currentUserId={currentUserId}
          onChanged={onRemindersChanged}
        />
      ) : null}

      {/* ── Vereinbarungen und Finanzen ────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold">{l("cust.sectionAgreements")}</h4>
        </div>
        <p className="mb-3 text-xs text-slate-500">{l("cust.agreementsHint")}</p>
        <div className="grid gap-1 text-sm">
          <div className="flex flex-wrap gap-2">
            <span className="text-slate-500">{l("cust.invoiceEmail")}:</span>
            {customer.billingEmail ? (
              <a href={`mailto:${customer.billingEmail}`} className="hover:underline">{customer.billingEmail}</a>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-slate-500">{l("cust.taxId")}:</span>
            <span>{customer.vatId ?? <span className="text-slate-400">—</span>}</span>
          </div>
        </div>

        {financials ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setReportsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <h5 className="text-sm font-semibold">{l("reports.title")}</h5>
              <CollapseIndicator open={reportsOpen} />
            </button>
            <CollapsibleContent open={reportsOpen}>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <FinancialKpi label={l("kpi.totalHours")} value={`${financials.totalHours} h`} />
                <FinancialKpi label={l("kpi.overtime")} value={`${financials.overtimeHours} h`} />
                <FinancialKpi label={l("kpi.totalRevenue")} value={`${financials.totalRevenue.toFixed(2)} EUR`} highlight />
                <FinancialKpi label={l("kpi.workerCosts")} value={`${financials.totalCosts.toFixed(2)} EUR`} />
                <FinancialKpi label={l("kpi.margin")} value={`${financials.margin.toFixed(2)} EUR`} highlight={financials.margin >= 0} warn={financials.margin < 0} />
              </div>

              <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("kpi.breakdown")}</h5>
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-500">{l("kpi.baseRevenue")}</span>
                  <span className="text-right font-mono">{financials.baseRevenue.toFixed(2)} EUR</span>
                  <span className="text-slate-500">{l("kpi.overtimeRevenue")}</span>
                  <span className="text-right font-mono">{financials.overtimeRevenue.toFixed(2)} EUR</span>
                  <span className="text-slate-500">{l("kpi.workerCosts")}</span>
                  <span className="text-right font-mono">-{financials.totalCosts.toFixed(2)} EUR</span>
                  <span className="font-medium">{l("kpi.margin")}</span>
                  <span className={cx("text-right font-mono font-medium", financials.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{financials.margin.toFixed(2)} EUR</span>
                </div>
              </div>

              {financials.projects.length > 0 ? (
                <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                  <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("kpi.perProject")}</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs text-slate-500">
                          <th className="pb-1 pr-3">{l("kpi.project")}</th>
                          <th className="pb-1 pr-3 text-right">{l("kpi.hours")}</th>
                          <th className="pb-1 pr-3 text-right">{l("kpi.revenue")}</th>
                          <th className="pb-1 pr-3 text-right">{l("kpi.costs")}</th>
                          <th className="pb-1 text-right">{l("kpi.marginShort")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financials.projects.map((p) => (
                          <tr key={p.projectId} className="border-t border-black/5 dark:border-white/5">
                            <td className="py-1 pr-3">
                              <Link href={`/projects/${p.projectId}`} className="hover:underline">{p.projectNumber}</Link>
                              <span className="ml-1 text-slate-400">{p.title}</span>
                            </td>
                            <td className="py-1 pr-3 text-right font-mono">{p.hours}</td>
                            <td className="py-1 pr-3 text-right font-mono">{p.revenue.toFixed(2)}</td>
                            <td className="py-1 pr-3 text-right font-mono">{p.costs.toFixed(2)}</td>
                            <td className={cx("py-1 text-right font-mono", p.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{p.margin.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </CollapsibleContent>
          </div>
        ) : null}
      </div>

      {/* ── Zugeordnete Projekte ───────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold">{l("cust.sectionProjects")}</h4>
          {onCreateProject ? (
            <button
              type="button"
              onClick={onCreateProject}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {l("cust.nextAddProject")}
            </button>
          ) : null}
        </div>
        {customerProjects.length === 0 ? (
          <p className="text-sm text-slate-500">{l("cust.noProjects")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-3">{l("table.nr")}</th>
                  <th className="pb-2 pr-3">{l("table.title")}</th>
                  <th className="pb-2 pr-3">{l("table.status")}</th>
                  <th className="pb-2 pr-3 text-right">{l("table.weeklyFlat")}</th>
                  <th className="pb-2 text-right">{l("table.hourlyRate")}</th>
                </tr>
              </thead>
              <tbody>
                {customerProjects.map((project) => (
                  <tr key={project.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-500">{project.projectNumber}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                        {project.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-medium", statusColor(project.status))}>
                        {statusLabel(project.status)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">
                      {project.weeklyFlatRate != null ? `${project.weeklyFlatRate.toFixed(2)} EUR` : "-"}
                    </td>
                    <td className="py-2 text-right font-mono text-xs">
                      {project.hourlyRateUpTo40h != null ? `${project.hourlyRateUpTo40h.toFixed(2)} EUR` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Notizen (Kunde) ──────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <InlineNotesSection
          entityType="CUSTOMER"
          customerId={customer.id}
          availableProjects={customerProjects}
          apiFetch={apiFetch}
        />
      </div>

      {/* ── Stundenzettel ────────────────────────────────────── */}
      <TimesheetList timesheets={customerTimesheets} apiFetch={apiFetch} title={l("ts.title")} />

      {/* ── Dokumente und Bilder ───────────────────────────────── */}
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

      {showPrintConfig ? (
        <PrintConfiguratorModal
          entityType="customer"
          entityId={customer.id}
          title={`${l("cust.printSheet")} — ${customer.companyName}`}
          documents={documents}
          onClose={() => setShowPrintConfig(false)}
          onPrint={handleConfiguredPrint}
        />
      ) : null}
    </div>
  );
}


function ContactCardWithNotes({
  contact,
  customerId,
  availableProjects,
  apiFetch,
  isPrimary = false,
  scopeLabel,
}: {
  contact: {
    id?: string;
    firstName: string;
    lastName: string;
    email?: string;
    phoneMobile?: string;
    phoneLandline?: string;
    role?: string;
    isAccountingContact?: boolean;
    isProjectContact?: boolean;
    isSignatory?: boolean;
  };
  customerId: string;
  availableProjects: Project[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  isPrimary?: boolean;
  /** Optionaler "Zentral" / "Standort" Hinweis fuer die Kontakteinordnung. */
  scopeLabel?: string;
}) {
  const { t: l } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const reminderHref = contact.id
    ? `/settings?tab=reminders&kind=CALLBACK&customerId=${encodeURIComponent(customerId)}&contactId=${encodeURIComponent(contact.id)}&title=${encodeURIComponent(`${l("reminder.prefixCallback")} ${contact.firstName} ${contact.lastName}`)}`
    : "";

  // Aktionsfaehiger Telefon-Eintrag: bevorzuge Mobil, fallback auf Festnetz.
  const callablePhone = contact.phoneMobile || contact.phoneLandline || "";

  return (
    <div
      className={cx(
        "rounded-xl p-3 text-sm",
        isPrimary
          ? "border-2 border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5"
          : "bg-slate-50/70 dark:bg-slate-950/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{contact.firstName} {contact.lastName}</span>
            {contact.role ? <span className="text-xs text-slate-400">({contact.role})</span> : null}
            {scopeLabel ? <RoleBadge tone="slate" label={scopeLabel} /> : null}
            {isPrimary ? <RoleBadge tone="emerald" label={l("cust.contactPrimary")} /> : null}
            {contact.isSignatory ? <RoleBadge tone="purple" label={l("cust.signatory")} /> : null}
            {contact.isAccountingContact ? <RoleBadge tone="amber" label={l("cust.accounting")} /> : null}
          </div>
          <div className="mt-1 text-slate-500">
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
            ) : (
              l("common.noEmail")
            )}
            {" · "}
            {l("common.mobile") + ":"}{" "}
            {contact.phoneMobile ? (
              <a href={`tel:${contact.phoneMobile}`} className="hover:underline">{contact.phoneMobile}</a>
            ) : (
              "-"
            )}
            {" · "}
            {l("common.office") + ":"}{" "}
            {contact.phoneLandline ? (
              <a href={`tel:${contact.phoneLandline}`} className="hover:underline">{contact.phoneLandline}</a>
            ) : (
              "-"
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
              title={l("cust.contactWriteEmail")}
            >
              {l("cust.contactWriteEmail")}
            </a>
          ) : null}
          {callablePhone ? (
            <a
              href={`tel:${callablePhone}`}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
              title={l("cust.contactCall")}
            >
              {l("cust.contactCall")}
            </a>
          ) : null}
          {contact.id ? (
            <Link
              href={reminderHref}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {l("cust.contactSetReminder")}
            </Link>
          ) : null}
          {contact.id ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              <span>{l("cust.contactToggleNotes")}</span>
              <CollapseIndicator open={expanded} />
            </button>
          ) : null}
        </div>
      </div>
      <CollapsibleContent open={expanded && Boolean(contact.id)}>
        {contact.id ? (
          <div className="border-t border-black/10 pt-3 dark:border-white/10">
            <InlineNotesSection
              entityType="CONTACT"
              customerId={customerId}
              contactId={contact.id}
              availableProjects={availableProjects}
              apiFetch={apiFetch}
            />
          </div>
        ) : null}
      </CollapsibleContent>
    </div>
  );
}

function RoleBadge({
  tone,
  label,
}: {
  tone: "emerald" | "blue" | "amber" | "purple" | "slate";
  label: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  };
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", toneClasses[tone])}>
      {label}
    </span>
  );
}

// ProjectDetailCard, ProjectNoticesSection, ProjectChecklistSection, FinancialKpi → ./crm-app/projects/

