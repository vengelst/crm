"use client";

import { useState } from "react";
import { useI18n } from "../../../i18n-context";
import {
  SecondaryButton,
  Field,
  FormRow,
  SelectField,
  TextArea,
  CollapseIndicator,
  CollapsibleContent,
} from "../shared";
import type { CustomerFormState, CustomerBranch, CustomerContact } from "../types";

export type CustomerFormSection = "basics" | "branches" | "contacts" | "agreements";

export type CustomerFormBodyProps = {
  form: CustomerFormState;
  setForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  /**
   * Welche Bereiche gerendert werden sollen. Default: alle vier (Backwards-
   * Kompatibilitaet). EditCustomerModal-Tabs und CreateCustomerModal nutzen
   * Teilmengen, damit der Nutzer pro Schritt nur den passenden Block sieht.
   */
  sections?: CustomerFormSection[];
};

/**
 * Shared form body for creating and editing customers. Renders the requested
 * sections (Stammdaten / Standorte / Ansprechpartner / Vereinbarungen). Beim
 * Bearbeiten klappen Sub-Bereiche automatisch auf, sobald dort schon Daten
 * vorhanden sind.
 */
export function CustomerFormBody({ form, setForm, sections }: CustomerFormBodyProps) {
  const visible = sections ?? ["basics", "branches", "contacts", "agreements"];
  return (
    <div className="grid gap-5">
      {visible.includes("basics") ? <CustomerBasicsSection form={form} setForm={setForm} /> : null}
      {visible.includes("branches") ? <CustomerBranchesSection form={form} setForm={setForm} /> : null}
      {visible.includes("contacts") ? <CustomerContactsSection form={form} setForm={setForm} /> : null}
      {visible.includes("agreements") ? <CustomerAgreementsSection form={form} setForm={setForm} /> : null}
    </div>
  );
}

/**
 * Stammdaten-Sektion: identifizierende Felder (Nummer, Name, Kontakt, Adresse).
 * Rechtsform, Website und Notizen sind in einem einklappbaren "Weitere Angaben"-
 * Block versteckt. Status, USt-ID und Rechnungs-E-Mail leben jetzt im eigenen
 * Reiter "Vereinbarungen / Finanzen".
 */
export function CustomerBasicsSection({ form, setForm }: CustomerFormBodyProps) {
  const { t: l } = useI18n();
  const hasMoreDetails = Boolean(form.legalForm || form.website || form.notes);
  const [moreOpen, setMoreOpen] = useState<boolean>(hasMoreDetails);

  return (
    <>
      <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
        <h3 className="mb-3 text-base font-semibold">{l("cust.basics")}</h3>
        <div className="grid gap-3">
          <FormRow>
            <Field label={l("cust.number")} value={form.customerNumber} onChange={(e) => setForm((f) => ({ ...f, customerNumber: e.target.value }))} />
            <Field label={l("cust.name")} value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
          </FormRow>
          <FormRow>
            <Field label={l("work.email")} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <Field label={l("cust.phone")} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </FormRow>
          <h4 className="mt-2 text-sm font-semibold uppercase tracking-wider text-slate-500">{l("cust.mainAddress")}</h4>
          <FormRow>
            <Field label={l("work.address")} value={form.addressLine1} onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))} />
            <Field label={l("work.address2")} value={form.addressLine2} onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))} />
          </FormRow>
          <FormRow>
            <Field label={l("work.postalCode")} value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
            <Field label={l("work.city")} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </FormRow>
          <FormRow>
            <Field label={l("work.country")} value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            <div />
          </FormRow>
        </div>
      </section>

      <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="text-base font-semibold">{l("cust.moreDetails")}</h3>
            <p className="text-xs text-slate-500">{l("cust.moreDetailsHint")}</p>
          </div>
          <CollapseIndicator open={moreOpen} />
        </button>
        <CollapsibleContent open={moreOpen}>
          <div className="grid gap-3">
            <FormRow>
              <Field label={l("cust.legalForm")} value={form.legalForm} onChange={(e) => setForm((f) => ({ ...f, legalForm: e.target.value }))} />
              <Field label={l("cust.website")} value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
            </FormRow>
            <TextArea label={l("work.notes")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </CollapsibleContent>
      </section>
    </>
  );
}

/**
 * Vereinbarungen / Finanzen-Sektion: bündelt Status, Rechnungs-E-Mail und
 * USt-ID. Der Hinweis macht klar, dass Projektpreise nicht hier sondern auf
 * den jeweiligen Projekten gepflegt werden.
 */
export function CustomerAgreementsSection({ form, setForm }: CustomerFormBodyProps) {
  const { t: l } = useI18n();
  return (
    <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
      <h3 className="mb-1 text-base font-semibold">{l("cust.sectionAgreements")}</h3>
      <p className="mb-3 text-xs text-slate-500">{l("cust.agreementsHint")}</p>
      <div className="grid gap-3">
        <FormRow>
          <SelectField
            label={l("proj.status")}
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={[
              { value: "ACTIVE", label: l("common.active") },
              { value: "INACTIVE", label: l("common.inactive") },
            ]}
          />
          <div />
        </FormRow>
        <p className="-mt-2 text-xs text-slate-500">{l("cust.agreementsStatusHint")}</p>
        <FormRow>
          <Field
            label={l("cust.invoiceEmail")}
            value={form.billingEmail}
            onChange={(e) => setForm((f) => ({ ...f, billingEmail: e.target.value }))}
          />
          <Field
            label={l("cust.taxId")}
            value={form.vatId}
            onChange={(e) => setForm((f) => ({ ...f, vatId: e.target.value }))}
          />
        </FormRow>
        <p className="text-xs text-slate-500">{l("cust.agreementsPricingHint")}</p>
      </div>
    </section>
  );
}

/** Standorte-Sektion: optionale Unterstruktur, deutlich nachrangig. */
export function CustomerBranchesSection({ form, setForm }: CustomerFormBodyProps) {
  const { t: l } = useI18n();

  function updateBranch(index: number, patch: Partial<CustomerBranch>) {
    setForm((prev) => ({
      ...prev,
      branches: prev.branches.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  }

  function removeBranch(index: number) {
    setForm((prev) => ({ ...prev, branches: prev.branches.filter((_, i) => i !== index) }));
  }

  function addBranch() {
    setForm((f) => ({
      ...f,
      branches: [...f.branches, { name: "", city: "", country: "DE", active: true }],
    }));
  }

  return (
    <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{l("cust.sectionLocations")}</h3>
        <SecondaryButton onClick={addBranch}>{l("cust.addBranch")}</SecondaryButton>
      </div>
      <p className="mb-3 text-xs text-slate-500">{l("cust.sectionLocationsHint")}</p>
      {form.branches.length === 0 ? (
        <p className="text-sm text-slate-500">{l("cust.locationsEmpty")}</p>
      ) : (
        <div className="grid gap-3">
          {form.branches.map((branch, index) => (
            <div key={branch.id ?? `new-${index}`} className="grid gap-2 rounded-xl border border-black/5 bg-white/60 p-3 dark:border-white/5 dark:bg-slate-900/60">
              <FormRow>
                <Field label={l("cust.branchName")} value={branch.name} onChange={(e) => updateBranch(index, { name: e.target.value })} />
                <Field label={l("work.city")} value={branch.city ?? ""} onChange={(e) => updateBranch(index, { city: e.target.value })} />
              </FormRow>
              <FormRow>
                <Field label={l("work.address")} value={branch.addressLine1 ?? ""} onChange={(e) => updateBranch(index, { addressLine1: e.target.value })} />
                <Field label={l("work.postalCode")} value={branch.postalCode ?? ""} onChange={(e) => updateBranch(index, { postalCode: e.target.value })} />
              </FormRow>
              <FormRow>
                <Field label={l("cust.phone")} value={branch.phone ?? ""} onChange={(e) => updateBranch(index, { phone: e.target.value })} />
                <Field label={l("work.email")} value={branch.email ?? ""} onChange={(e) => updateBranch(index, { email: e.target.value })} />
              </FormRow>
              <div className="flex justify-end">
                <SecondaryButton onClick={() => removeBranch(index)}>{l("common.remove")}</SecondaryButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Ansprechpartner-Sektion. Zentrale Kontakte (ohne Standortzuordnung) und
 * standortbezogene Kontakte werden in zwei getrennten Gruppen dargestellt.
 * Genau ein Kontakt kann als "Hauptkontakt" markiert werden — die Auswahl ist
 * exklusiv (alle anderen verlieren das Flag automatisch). Das Backend speichert
 * den Hauptkontakt als `isProjectContact=true`.
 */
export function CustomerContactsSection({ form, setForm }: CustomerFormBodyProps) {
  const { t: l } = useI18n();

  function updateContact(index: number, patch: Partial<CustomerContact>) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function removeContact(index: number) {
    setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== index) }));
  }

  function setPrimary(index: number) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => ({
        ...c,
        isProjectContact: i === index,
      })),
    }));
  }

  function addContact(asPrimary: boolean, branchKey?: string) {
    setForm((f) => {
      const branchInfo = parseBranchKey(branchKey, f.branches);
      const next: CustomerContact = {
        firstName: "",
        lastName: "",
        branchId: branchInfo.branchId,
        branchName: branchInfo.branchName,
      };
      const updatedExisting = asPrimary
        ? f.contacts.map((c) => ({ ...c, isProjectContact: false }))
        : f.contacts;
      const newContact: CustomerContact = asPrimary
        ? { ...next, isProjectContact: true }
        : next;
      return { ...f, contacts: [...updatedExisting, newContact] };
    });
  }

  // Gruppierung fuer Anzeige: zentrale Kontakte zuerst, dann pro Standort.
  const centralContacts = form.contacts
    .map((c, i) => ({ contact: c, index: i }))
    .filter((entry) => !entry.contact.branchId && !entry.contact.branchName);
  const branchGroups = form.branches.map((branch) => ({
    branch,
    entries: form.contacts
      .map((c, i) => ({ contact: c, index: i }))
      .filter(
        (entry) =>
          (branch.id && entry.contact.branchId === branch.id) ||
          (!branch.id && branch.name && entry.contact.branchName === branch.name),
      ),
  }));

  const hasAnyPrimary = form.contacts.some((c) => c.isProjectContact);

  return (
    <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{l("cust.sectionContacts")}</h3>
        <SecondaryButton onClick={() => addContact(!hasAnyPrimary)}>{l("cust.addContact")}</SecondaryButton>
      </div>
      <p className="mb-3 text-xs text-slate-500">{l("cust.primaryContactHint")}</p>

      {form.contacts.length === 0 ? (
        <p className="text-sm text-slate-500">{l("cust.noContactsYet")}</p>
      ) : (
        <div className="grid gap-4">
          {/* Zentrale Kontakte */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{l("cust.centralContactsHeading")}</h4>
            {centralContacts.length === 0 ? (
              <p className="text-xs text-slate-500">{l("cust.centralContactsEmpty")}</p>
            ) : (
              <div className="grid gap-3">
                {centralContacts.map((entry) => (
                  <ContactFormRow
                    key={entry.contact.id ?? `new-central-${entry.index}`}
                    contact={entry.contact}
                    branches={form.branches}
                    isPrimary={!!entry.contact.isProjectContact}
                    canSetPrimary
                    onSetPrimary={() => setPrimary(entry.index)}
                    onChange={(patch) => updateContact(entry.index, patch)}
                    onRemove={() => removeContact(entry.index)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Standortbezogene Kontakte je Standort */}
          {branchGroups.length > 0
            ? branchGroups.map((group) => (
                <div key={group.branch.id ?? group.branch.name}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {l("cust.branchContactsHeading")}: {group.branch.name || l("cust.branchName")}
                    </h4>
                    <SecondaryButton
                      onClick={() =>
                        addContact(
                          false,
                          group.branch.id ? `id:${group.branch.id}` : `name:${group.branch.name}`,
                        )
                      }
                    >
                      {l("cust.addContact")}
                    </SecondaryButton>
                  </div>
                  {group.entries.length === 0 ? (
                    <p className="text-xs text-slate-500">{l("cust.branchContactsEmpty")}</p>
                  ) : (
                    <div className="grid gap-3">
                      {group.entries.map((entry) => (
                        <ContactFormRow
                          key={entry.contact.id ?? `new-${group.branch.name}-${entry.index}`}
                          contact={entry.contact}
                          branches={form.branches}
                          isPrimary={!!entry.contact.isProjectContact}
                          canSetPrimary
                          onSetPrimary={() => setPrimary(entry.index)}
                          onChange={(patch) => updateContact(entry.index, patch)}
                          onRemove={() => removeContact(entry.index)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            : null}
        </div>
      )}
    </section>
  );
}

function parseBranchKey(
  key: string | undefined,
  branches: CustomerBranch[],
): { branchId?: string; branchName?: string } {
  if (!key) return {};
  if (key.startsWith("id:")) return { branchId: key.slice(3) };
  if (key.startsWith("name:")) return { branchName: key.slice(5) };
  // Bestand-Branchen: vergleiche per id, sonst per name
  const match = branches.find((b) => b.id === key || b.name === key);
  return match?.id ? { branchId: match.id } : { branchName: key };
}

/**
 * Ein einzelner Ansprechpartner-Eintrag im Formular. Sichtbar zuerst nur die
 * Alltagsfelder (Name, E-Mail, Mobil); Rolle, Standort, Telefon-Festnetz,
 * Markierungs-Flags und Notizen liegen in einer einklappbaren Detailansicht.
 * "Hauptkontakt" ist exklusiv: Klick markiert diesen Eintrag und entfernt das
 * Flag von allen anderen.
 */
function ContactFormRow({
  contact,
  branches,
  isPrimary,
  canSetPrimary,
  onSetPrimary,
  onChange,
  onRemove,
}: {
  contact: CustomerContact;
  branches: CustomerBranch[];
  isPrimary: boolean;
  canSetPrimary: boolean;
  onSetPrimary: () => void;
  onChange: (patch: Partial<CustomerContact>) => void;
  onRemove: () => void;
}) {
  const { t: l } = useI18n();

  const hasDetails = Boolean(
    contact.role ||
      contact.phoneLandline ||
      contact.notes ||
      contact.branchId ||
      contact.branchName ||
      contact.isAccountingContact ||
      contact.isSignatory,
  );
  const [open, setOpen] = useState<boolean>(hasDetails);

  const branchOptions = [
    { value: "", label: l("cust.contactNoBranchOption") },
    ...branches.map((b) => ({
      value: b.id ? `id:${b.id}` : `name:${b.name}`,
      label: b.name || l("cust.branchName"),
    })),
  ];
  const currentBranchValue = contact.branchId
    ? `id:${contact.branchId}`
    : contact.branchName
      ? `name:${contact.branchName}`
      : "";

  return (
    <div
      className={
        isPrimary
          ? "grid gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5"
          : "grid gap-3 rounded-xl border border-black/5 bg-white/60 p-3 dark:border-white/5 dark:bg-slate-900/60"
      }
    >
      {/* Hauptkontakt-Marker */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isPrimary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            {l("cust.contactPrimary")}
          </span>
        ) : canSetPrimary ? (
          <button
            type="button"
            onClick={onSetPrimary}
            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {l("cust.markAsPrimary")}
          </button>
        ) : null}
      </div>

      <FormRow>
        <Field label={l("work.firstName")} value={contact.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        <Field label={l("work.lastName")} value={contact.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
      </FormRow>
      <FormRow>
        <Field label={l("work.email")} value={contact.email ?? ""} onChange={(e) => onChange({ email: e.target.value })} />
        <Field label={l("work.mobile")} value={contact.phoneMobile ?? ""} onChange={(e) => onChange({ phoneMobile: e.target.value })} />
      </FormRow>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
      >
        <span>{l("cust.contactMore")}</span>
        <CollapseIndicator open={open} />
      </button>
      <CollapsibleContent open={open}>
        <div className="grid gap-3">
          <FormRow>
            <Field label={l("cust.contactRole")} value={contact.role ?? ""} onChange={(e) => onChange({ role: e.target.value })} />
            <Field label={l("work.office")} value={contact.phoneLandline ?? ""} onChange={(e) => onChange({ phoneLandline: e.target.value })} />
          </FormRow>
          {branches.length > 0 ? (
            <FormRow>
              <SelectField
                label={l("cust.contactBranchAssignment")}
                value={currentBranchValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) { onChange({ branchId: undefined, branchName: undefined }); return; }
                  if (v.startsWith("id:")) { onChange({ branchId: v.slice(3), branchName: undefined }); return; }
                  onChange({ branchId: undefined, branchName: v.slice(5) });
                }}
                options={branchOptions}
              />
              <div />
            </FormRow>
          ) : null}
          <fieldset className="grid gap-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500">{l("cust.contactRoles")}</legend>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!contact.isAccountingContact}
                  onChange={(e) => onChange({ isAccountingContact: e.target.checked })}
                />
                <span>{l("cust.accounting")}</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!contact.isSignatory}
                  onChange={(e) => onChange({ isSignatory: e.target.checked })}
                />
                <span>{l("cust.signatory")}</span>
              </label>
            </div>
          </fieldset>
          <TextArea label={l("work.notes")} value={contact.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      </CollapsibleContent>

      <div className="flex justify-end">
        <SecondaryButton onClick={onRemove}>{l("common.remove")}</SecondaryButton>
      </div>
    </div>
  );
}

/** Strip empty strings from payload to match API expectations. */
export function sanitizeCustomerPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === "") continue;
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null ? sanitizeCustomerPayload(item as Record<string, unknown>) : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Build the SaveCustomerDto-shaped payload from the form state. */
export function customerFormToPayload(form: CustomerFormState): Record<string, unknown> {
  return sanitizeCustomerPayload({
    customerNumber: form.customerNumber,
    companyName: form.companyName,
    legalForm: form.legalForm,
    status: form.status,
    billingEmail: form.billingEmail,
    phone: form.phone,
    email: form.email,
    website: form.website,
    vatId: form.vatId,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    postalCode: form.postalCode,
    city: form.city,
    country: form.country,
    notes: form.notes,
    branches: form.branches.map((b) => ({
      id: b.id,
      name: b.name,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      postalCode: b.postalCode,
      city: b.city,
      country: b.country,
      phone: b.phone,
      email: b.email,
      notes: b.notes,
      active: b.active ?? true,
    })),
    contacts: form.contacts.map((c) => ({
      id: c.id,
      branchId: c.branchId,
      branchName: c.branchName,
      firstName: c.firstName,
      lastName: c.lastName,
      role: c.role,
      email: c.email,
      phoneMobile: c.phoneMobile,
      phoneLandline: c.phoneLandline,
      isAccountingContact: c.isAccountingContact,
      isProjectContact: c.isProjectContact,
      isSignatory: c.isSignatory,
      notes: c.notes,
    })),
  });
}
