"use client";

import { useI18n } from "../../../i18n-context";
import Link from "next/link";
import { type Dispatch, type SetStateAction, useEffect, useState, useCallback } from "react";
import type {
  Customer, Project, CustomerFinancials, DocumentItem,
  DocumentFormState, TimesheetItem,
} from "../types";
import { cx, formatAddress, mapsUrlFromParts, SectionCard, SecondaryButton, MapLinkButton, PrintButton, openPrintWindow } from "../shared";
import { DocumentPanel } from "../documents";
import { TimesheetList, FinancialKpi } from "../projects";
import { InlineNotesSection } from "../notes";

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
  apiFetch,
}: {
  customer: Customer;
  customerProjects: Project[];
  financials: CustomerFinancials | null;
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
  const [customerTimesheets, setCustomerTimesheets] = useState<TimesheetItem[]>([]);

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

  const customerReminderHref = `/settings?tab=reminders&kind=FOLLOW_UP&customerId=${encodeURIComponent(customer.id)}&title=${encodeURIComponent(`Wiedervorlage ${customer.companyName}`)}`;

  function printCustomer() {
    const addr = formatAddress([customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country]);
    const branches = customer.branches.map((b) => `<tr><td>${b.name}</td><td>${formatAddress([b.addressLine1, b.postalCode, b.city])}</td><td>${b.phone ?? "-"}</td><td>${b.email ?? "-"}</td></tr>`).join("");
    const contacts = customer.contacts.map((c) => `<tr><td>${c.firstName} ${c.lastName}</td><td>${c.role ?? "-"}</td><td>${c.phoneMobile ?? "-"}</td><td>${c.email ?? "-"}</td></tr>`).join("");
    openPrintWindow(`${l("print.customer")} ${customer.companyName}`, `
      <h1>${customer.companyName}</h1>
      <p class="meta">${customer.customerNumber} · ${customer.status ?? ""}</p>
      <h2>${l("print.masterData")}</h2>
      <div class="grid">
        <span class="label">${l("print.address")}</span><span>${addr || "-"}</span>
        <span class="label">${l("print.phone")}</span><span>${customer.phone ?? "-"}</span>
        <span class="label">${l("print.email")}</span><span>${customer.email ?? "-"}</span>
        <span class="label">${l("print.website")}</span><span>${customer.website ?? "-"}</span>
        <span class="label">${l("print.vatId")}</span><span>${customer.vatId ?? "-"}</span>
      </div>
      ${customer.branches.length > 0 ? `<h2>${l("cust.branches")}</h2><table><thead><tr><th>${l("print.name")}</th><th>${l("print.address")}</th><th>${l("print.phone")}</th><th>${l("print.email")}</th></tr></thead><tbody>${branches}</tbody></table>` : ""}
      ${customer.contacts.length > 0 ? `<h2>${l("cust.contacts")}</h2><table><thead><tr><th>${l("print.name")}</th><th>${l("print.role")}</th><th>${l("print.mobile")}</th><th>${l("print.email")}</th></tr></thead><tbody>${contacts}</tbody></table>` : ""}
      ${customer.notes ? `<h2>${l("print.notes")}</h2><p>${customer.notes}</p>` : ""}
    `);
  }

  return (
    <div className="grid gap-5">
      {/* ── Stammdaten ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{customer.companyName}</h3>
            <p className="text-sm text-slate-500">{customer.customerNumber}</p>
          </div>
          <div className="flex gap-2">
            {customerMapsUrl ? <MapLinkButton href={customerMapsUrl}>{l("common.googleMaps")}</MapLinkButton> : null}
            <Link href={customerReminderHref} className="inline-flex items-center rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800">
              {l("settings.remindersQuickCreate")}
            </Link>
            <PrintButton onClick={printCustomer} label={l("cust.printSheet")} />
          </div>
        </div>
        <div className="grid gap-1 text-sm text-slate-500">
          <div>{formatAddress([customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country]) || l("cust.noAddress")}</div>
          <div>{customer.email ?? l("common.noEmail")} · {customer.phone ?? l("common.noPhone")}</div>
        </div>
      </div>

      {/* ── Niederlassungen ────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">{l("cust.branches")}</h4>
        {customer.branches.length === 0 ? (
          <p className="text-sm text-slate-500">{l("cust.noBranches")}</p>
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

      {/* ── Ansprechpartner ────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">{l("cust.contacts")}</h4>
        {customer.contacts.length === 0 ? (
          <p className="text-sm text-slate-500">{l("cust.noContacts")}</p>
        ) : (
          <div className="grid gap-2">
            {customer.contacts.map((contact, index) => (
              <ContactCardWithNotes
                key={`${contact.id ?? `${contact.firstName}-${contact.lastName}`}-${index}`}
                contact={contact}
                customerId={customer.id}
                availableProjects={customerProjects}
                apiFetch={apiFetch}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Zugeordnete Projekte ───────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">{l("cust.currentProjects")}</h4>
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

      {/* ── Kunden-Auswertung ──────────────────────────────────── */}
      {financials ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
          <h4 className="mb-3 text-base font-semibold">{l("reports.title")}</h4>
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
        </div>
      ) : null}

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
    </div>
  );
}


function ContactCardWithNotes({
  contact,
  customerId,
  availableProjects,
  apiFetch,
}: {
  contact: { id?: string; firstName: string; lastName: string; email?: string; phoneMobile?: string; phoneLandline?: string; role?: string };
  customerId: string;
  availableProjects: Project[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const { t: l } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const reminderHref = contact.id
    ? `/settings?tab=reminders&kind=CALLBACK&customerId=${encodeURIComponent(customerId)}&contactId=${encodeURIComponent(contact.id)}&title=${encodeURIComponent(`Rueckruf ${contact.firstName} ${contact.lastName}`)}`
    : "";

  return (
    <div className="rounded-xl bg-slate-50/70 p-3 text-sm dark:bg-slate-950/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">
            {contact.firstName} {contact.lastName}
            {contact.role ? <span className="ml-2 text-xs text-slate-400">({contact.role})</span> : null}
          </div>
          <div className="text-slate-500">
            {contact.email || l("common.noEmail")} · {l("common.mobile") + ":"} {contact.phoneMobile || "-"} · {l("common.office") + ":"}{" "}
            {contact.phoneLandline || "-"}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {contact.id ? (
            <Link
              href={reminderHref}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {l("settings.remindersQuickCallback")}
            </Link>
          ) : null}
          {contact.id ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              {expanded ? l("notes.title") + " ▲" : l("notes.title") + " ▼"}
            </button>
          ) : null}
        </div>
      </div>
      {expanded && contact.id ? (
        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
          <InlineNotesSection
            entityType="CONTACT"
            customerId={customerId}
            contactId={contact.id}
            availableProjects={availableProjects}
            apiFetch={apiFetch}
          />
        </div>
      ) : null}
    </div>
  );
}

// ProjectDetailCard, ProjectNoticesSection, ProjectChecklistSection, FinancialKpi → ./crm-app/projects/

