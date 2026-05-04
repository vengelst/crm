"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "../../../i18n-context";
import { SecondaryButton, cx } from "../shared";
import type { Customer, CustomerFormState, Project } from "../types";
import {
  CustomerFormBody,
  customerFormToPayload,
  type CustomerFormSection,
} from "./CustomerFormBody";

/**
 * Tab-Identifier des Edit-Modals. Vier Reiter sind echte Bearbeitungsbereiche
 * (basics/contacts/branches/agreements), "projects" ist ein read-only
 * Schnellzugriff auf die Projekte des Kunden.
 */
export type EditCustomerInitialTab =
  | CustomerFormSection
  | "projects";

/** Voreinstellungen, mit denen die Bearbeitung geöffnet werden kann. */
export type EditCustomerPrefill = {
  /** Beim Öffnen einen leeren Standort vorbereiten. */
  newBranch?: boolean;
  /** Beim Öffnen einen leeren Kontakt vorbereiten. Optional als Hauptkontakt. */
  newContact?: { asPrimary?: boolean };
};

const TABS: EditCustomerInitialTab[] = [
  "basics",
  "contacts",
  "branches",
  "agreements",
  "projects",
];

function tabLabelKey(tab: EditCustomerInitialTab): string {
  switch (tab) {
    case "basics": return "cust.editTabBasics";
    case "contacts": return "cust.editTabContacts";
    case "branches": return "cust.editTabBranches";
    case "agreements": return "cust.editTabAgreements";
    case "projects": return "cust.editTabProjects";
  }
}

function customerToForm(customer: Customer): CustomerFormState {
  return {
    id: customer.id,
    customerNumber: customer.customerNumber ?? "",
    companyName: customer.companyName ?? "",
    legalForm: customer.legalForm ?? "",
    status: customer.status ?? "ACTIVE",
    billingEmail: customer.billingEmail ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    website: customer.website ?? "",
    vatId: customer.vatId ?? "",
    addressLine1: customer.addressLine1 ?? "",
    addressLine2: customer.addressLine2 ?? "",
    postalCode: customer.postalCode ?? "",
    city: customer.city ?? "",
    country: customer.country ?? "DE",
    notes: customer.notes ?? "",
    branches: (customer.branches ?? []).map((b) => ({ ...b })),
    contacts: (customer.contacts ?? []).map((c) => ({ ...c })),
  };
}

function applyPrefill(
  state: CustomerFormState,
  prefill: EditCustomerPrefill | undefined,
): CustomerFormState {
  if (!prefill) return state;
  let next = state;
  if (prefill.newBranch) {
    next = {
      ...next,
      branches: [...next.branches, { name: "", city: "", country: "DE", active: true }],
    };
  }
  if (prefill.newContact) {
    const asPrimary = prefill.newContact.asPrimary ?? false;
    const updatedExisting = asPrimary
      ? next.contacts.map((c) => ({ ...c, isProjectContact: false }))
      : next.contacts;
    next = {
      ...next,
      contacts: [
        ...updatedExisting,
        { firstName: "", lastName: "", isProjectContact: asPrimary || undefined },
      ],
    };
  }
  return next;
}

export function EditCustomerModal({
  customer,
  customerProjects,
  apiFetch,
  onSaved,
  onClose,
  initialTab,
  prefill,
  onCreateProject,
}: {
  customer: Customer;
  /** Projekte dieses Kunden für den read-only Projekte-Reiter. */
  customerProjects?: Project[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  initialTab?: EditCustomerInitialTab;
  prefill?: EditCustomerPrefill;
  /** Callback für "Projekt anlegen" im Projekte-Reiter. */
  onCreateProject?: () => void;
}) {
  const { t: l } = useI18n();
  const [form, setForm] = useState<CustomerFormState>(() => applyPrefill(customerToForm(customer), prefill));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditCustomerInitialTab>(initialTab ?? "basics");

  const isProjectsTab = activeTab === "projects";

  async function handleSubmit() {
    if (!form.companyName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/customers/${customer.id}`, {
        method: "PATCH",
        body: JSON.stringify(customerFormToPayload(form)),
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 pb-12" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border-2 border-emerald-300 bg-white p-6 shadow-xl dark:border-emerald-500/40 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {l("cust.edit")} — {customer.companyName}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{l("cust.editTabHint")}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
        </div>

        {/* Tab-Leiste */}
        <div role="tablist" aria-label={l("cust.edit")} className="mb-4 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
          {TABS.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={cx(
                  "rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition",
                  active
                    ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
                )}
              >
                {l(tabLabelKey(tab))}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {isProjectsTab ? (
            <CustomerProjectsQuickView
              projects={customerProjects ?? []}
              onCreateProject={onCreateProject}
            />
          ) : (
            <CustomerFormBody form={form} setForm={setForm} sections={[activeTab as CustomerFormSection]} />
          )}
        </div>

        {/* Fußzeile: nur Speichern/Abbrechen für die echten Bearbeitungs-Reiter */}
        <div className="mt-5 flex gap-3">
          {!isProjectsTab ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
            >
              {submitting ? l("common.saving") : l("common.save")}
            </button>
          ) : null}
          <SecondaryButton onClick={onClose}>
            {isProjectsTab ? l("common.close") : l("notes.cancel")}
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Projekte-Reiter: read-only Schnellzugriff auf Projekte dieses Kunden.
 * Inline-Bearbeitung ist hier nicht vorgesehen – Anlage und Detail laufen über
 * den bestehenden Projekt-Bereich (Anlage über Callback, Öffnen über /projects/:id).
 */
function CustomerProjectsQuickView({
  projects,
  onCreateProject,
}: {
  projects: Project[];
  onCreateProject?: () => void;
}) {
  const { t: l } = useI18n();
  return (
    <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{l("cust.sectionProjects")}</h3>
        {onCreateProject ? (
          <button
            type="button"
            onClick={onCreateProject}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            {l("cust.nextAddProject")}
          </button>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-slate-500">{l("cust.projectsTabHint")}</p>
      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">{l("cust.projectsTabEmpty")}</p>
      ) : (
        <div className="grid gap-2">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm dark:bg-slate-900/60"
            >
              <div className="min-w-0">
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-slate-500">
                  {p.projectNumber}
                  {p.status ? <span className="ml-2">· {p.status}</span> : null}
                </div>
              </div>
              <Link
                href={`/projects/${p.id}`}
                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                {l("cust.openProject")}
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
