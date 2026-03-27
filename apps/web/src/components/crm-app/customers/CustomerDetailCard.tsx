"use client";

import Link from "next/link";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type {
  Customer, Project, CustomerFinancials, DocumentItem,
  DocumentFormState, TimesheetItem,
} from "../types";
import { cx, formatAddress, mapsUrlFromParts, SectionCard, SecondaryButton, MapLinkButton, PrintButton, openPrintWindow } from "../shared";
import { DocumentPanel } from "../documents";
import { TimesheetList, FinancialKpi } from "../projects";

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
    switch (status) {
      case "DRAFT": return "Entwurf";
      case "PLANNED": return "Geplant";
      case "ACTIVE": return "Aktiv";
      case "PAUSED": return "Pausiert";
      case "COMPLETED": return "Abgeschlossen";
      case "CANCELED": return "Storniert";
      default: return status ?? "-";
    }
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

  function printCustomer() {
    const addr = formatAddress([customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country]);
    const branches = customer.branches.map((b) => `<tr><td>${b.name}</td><td>${formatAddress([b.addressLine1, b.postalCode, b.city])}</td><td>${b.phone ?? "-"}</td><td>${b.email ?? "-"}</td></tr>`).join("");
    const contacts = customer.contacts.map((c) => `<tr><td>${c.firstName} ${c.lastName}</td><td>${c.role ?? "-"}</td><td>${c.phoneMobile ?? "-"}</td><td>${c.email ?? "-"}</td></tr>`).join("");
    openPrintWindow(`Kunde ${customer.companyName}`, `
      <h1>${customer.companyName}</h1>
      <p class="meta">${customer.customerNumber} · ${customer.status ?? ""}</p>
      <h2>Stammdaten</h2>
      <div class="grid">
        <span class="label">Adresse</span><span>${addr || "-"}</span>
        <span class="label">Telefon</span><span>${customer.phone ?? "-"}</span>
        <span class="label">E-Mail</span><span>${customer.email ?? "-"}</span>
        <span class="label">Website</span><span>${customer.website ?? "-"}</span>
        <span class="label">USt-IdNr</span><span>${customer.vatId ?? "-"}</span>
      </div>
      ${customer.branches.length > 0 ? `<h2>Niederlassungen</h2><table><thead><tr><th>Name</th><th>Adresse</th><th>Telefon</th><th>E-Mail</th></tr></thead><tbody>${branches}</tbody></table>` : ""}
      ${customer.contacts.length > 0 ? `<h2>Ansprechpartner</h2><table><thead><tr><th>Name</th><th>Rolle</th><th>Mobil</th><th>E-Mail</th></tr></thead><tbody>${contacts}</tbody></table>` : ""}
      ${customer.notes ? `<h2>Notizen</h2><p>${customer.notes}</p>` : ""}
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
            {customerMapsUrl ? <MapLinkButton href={customerMapsUrl}>Google Maps</MapLinkButton> : null}
            <PrintButton onClick={printCustomer} label="Stammblatt drucken" />
          </div>
        </div>
        <div className="grid gap-1 text-sm text-slate-500">
          <div>{formatAddress([customer.addressLine1, customer.addressLine2, customer.postalCode, customer.city, customer.country]) || "Keine Adresse hinterlegt."}</div>
          <div>{customer.email ?? "Keine E-Mail"} · {customer.phone ?? "Kein Telefon"}</div>
        </div>
      </div>

      {/* ── Niederlassungen ────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Niederlassungen</h4>
        {customer.branches.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Niederlassungen vorhanden.</p>
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
                      <MapLinkButton href={branchMapsUrl}>Google Maps</MapLinkButton>
                    ) : null}
                  </div>
                  <div className="text-sm text-slate-500">
                    {formatAddress([
                      branch.addressLine1,
                      branch.addressLine2,
                      branch.postalCode,
                      branch.city,
                      branch.country,
                    ]) || "Keine Adresse"}
                  </div>
                  <div className="text-sm text-slate-500">
                    {branch.phone || "Kein Telefon"} · {branch.email || "Keine E-Mail"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Ansprechpartner ────────────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Ansprechpartner</h4>
        {customer.contacts.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Ansprechpartner vorhanden.</p>
        ) : (
          <div className="grid gap-2">
            {customer.contacts.map((contact, index) => (
              <div
                key={`${contact.id ?? `${contact.firstName}-${contact.lastName}`}-${index}`}
                className="grid gap-1 rounded-xl bg-slate-50/70 p-3 text-sm dark:bg-slate-950/40"
              >
                <div className="font-medium">
                  {contact.firstName} {contact.lastName}
                </div>
                <div className="text-slate-500">
                  {contact.email || "Keine E-Mail"} · Mobil: {contact.phoneMobile || "-"} · Buero:{" "}
                  {contact.phoneLandline || "-"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Zugeordnete Projekte ───────────────────────────────── */}
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-3 text-base font-semibold">Zugeordnete Projekte</h4>
        {customerProjects.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Projekte zugeordnet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-3">Nr.</th>
                  <th className="pb-2 pr-3">Titel</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3 text-right">Wochenpauschale</th>
                  <th className="pb-2 text-right">Stundensatz</th>
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
          <h4 className="mb-3 text-base font-semibold">Auswertung gesamt</h4>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FinancialKpi label="Stunden gesamt" value={`${financials.totalHours} h`} />
              <FinancialKpi label="davon Ueberstunden" value={`${financials.overtimeHours} h`} />
              <FinancialKpi label="Umsatz gesamt" value={`${financials.totalRevenue.toFixed(2)} EUR`} highlight />
              <FinancialKpi label="Monteurkosten" value={`${financials.totalCosts.toFixed(2)} EUR`} />
              <FinancialKpi label="Deckungsbeitrag" value={`${financials.margin.toFixed(2)} EUR`} highlight={financials.margin >= 0} warn={financials.margin < 0} />
            </div>

            <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Aufschluesselung</h5>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Grundumsatz</span>
                <span className="text-right font-mono">{financials.baseRevenue.toFixed(2)} EUR</span>
                <span className="text-slate-500">Ueberstundenumsatz</span>
                <span className="text-right font-mono">{financials.overtimeRevenue.toFixed(2)} EUR</span>
                <span className="text-slate-500">Monteurkosten</span>
                <span className="text-right font-mono">-{financials.totalCosts.toFixed(2)} EUR</span>
                <span className="font-medium">Deckungsbeitrag</span>
                <span className={cx("text-right font-mono font-medium", financials.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{financials.margin.toFixed(2)} EUR</span>
              </div>
            </div>

            {financials.projects.length > 0 ? (
              <div className="rounded-xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
                <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Pro Projekt</h5>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500">
                        <th className="pb-1 pr-3">Projekt</th>
                        <th className="pb-1 pr-3 text-right">Stunden</th>
                        <th className="pb-1 pr-3 text-right">Umsatz</th>
                        <th className="pb-1 pr-3 text-right">Kosten</th>
                        <th className="pb-1 text-right">Marge</th>
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

      {/* ── Stundenzettel ────────────────────────────────────── */}
      <TimesheetList timesheets={customerTimesheets} apiFetch={apiFetch} title="Stundenzettel (alle Projekte)" />

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


// ProjectDetailCard, ProjectNoticesSection, ProjectChecklistSection, FinancialKpi → ./crm-app/projects/

