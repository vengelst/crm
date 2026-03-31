"use client";

import { useState } from "react";
import { useI18n } from "../../../i18n-context";
import { SecondaryButton, Field, FormRow, SelectField, TextArea } from "../shared";
import type { CustomerFormState, CustomerBranch, CustomerContact } from "../types";

const emptyForm = (): CustomerFormState => ({
  customerNumber: "",
  companyName: "",
  legalForm: "",
  status: "ACTIVE",
  billingEmail: "",
  phone: "",
  email: "",
  website: "",
  vatId: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  country: "DE",
  notes: "",
  branches: [],
  contacts: [],
});

export function CreateCustomerModal({
  apiFetch,
  onCreated,
  onClose,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  onCreated: (customerId: string) => void;
  onClose: () => void;
}) {
  const { t: l } = useI18n();
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateBranch(index: number, patch: Partial<CustomerBranch>) {
    setForm((prev) => ({
      ...prev,
      branches: prev.branches.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  }

  function removeBranch(index: number) {
    setForm((prev) => ({ ...prev, branches: prev.branches.filter((_, i) => i !== index) }));
  }

  function updateContact(index: number, patch: Partial<CustomerContact>) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function removeContact(index: number) {
    setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== index) }));
  }

  async function handleSubmit() {
    if (!form.companyName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = sanitize({
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

      const result = await apiFetch<{ id: string }>("/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 pb-12" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border-2 border-red-300 bg-white p-6 shadow-xl dark:border-red-500/40 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{l("cust.createTitle")}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* ── Stammdaten ────────────────── */}
          <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
            <h3 className="mb-3 text-base font-semibold">{l("cust.masterData")}</h3>
            <div className="grid gap-3">
              <FormRow>
                <Field label={l("cust.number")} value={form.customerNumber} onChange={(e) => setForm((f) => ({ ...f, customerNumber: e.target.value }))} />
                <Field label={l("cust.name")} value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
              </FormRow>
              <FormRow>
                <Field label={l("work.email")} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                <Field label={l("cust.phone")} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </FormRow>
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
                <SelectField
                  label={l("proj.status")}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  options={[
                    { value: "ACTIVE", label: l("common.active") },
                    { value: "INACTIVE", label: l("common.inactive") },
                  ]}
                />
              </FormRow>
              <TextArea label={l("work.notes")} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </section>

          {/* ── Niederlassungen ────────────── */}
          <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{l("cust.branches")}</h3>
              <SecondaryButton onClick={() => setForm((f) => ({ ...f, branches: [...f.branches, { name: "", city: "", country: "DE", active: true }] }))}>
                {l("common.add")}
              </SecondaryButton>
            </div>
            {form.branches.length === 0 ? (
              <p className="text-sm text-slate-500">{l("cust.noBranchesYet")}</p>
            ) : (
              <div className="grid gap-3">
                {form.branches.map((branch, index) => (
                  <div key={index} className="grid gap-2 rounded-xl border border-black/5 bg-white/60 p-3 dark:border-white/5 dark:bg-slate-900/60">
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

          {/* ── Ansprechpartner ────────────── */}
          <section className="rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{l("cust.contacts")}</h3>
              <SecondaryButton onClick={() => setForm((f) => ({ ...f, contacts: [...f.contacts, { firstName: "", lastName: "", branchId: "", branchName: "" }] }))}>
                {l("common.add")}
              </SecondaryButton>
            </div>
            {form.contacts.length === 0 ? (
              <p className="text-sm text-slate-500">{l("cust.noContactsYet")}</p>
            ) : (
              <div className="grid gap-3">
                {form.contacts.map((contact, index) => (
                  <div key={index} className="grid gap-2 rounded-xl border border-black/5 bg-white/60 p-3 dark:border-white/5 dark:bg-slate-900/60">
                    <FormRow>
                      <Field label={l("work.firstName")} value={contact.firstName} onChange={(e) => updateContact(index, { firstName: e.target.value })} />
                      <Field label={l("work.lastName")} value={contact.lastName} onChange={(e) => updateContact(index, { lastName: e.target.value })} />
                    </FormRow>
                    <FormRow>
                      <Field label={l("work.email")} value={contact.email ?? ""} onChange={(e) => updateContact(index, { email: e.target.value })} />
                      <SelectField
                        label={l("cust.branches")}
                        value={contact.branchId ? `id:${contact.branchId}` : contact.branchName ? `name:${contact.branchName}` : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) { updateContact(index, { branchId: undefined, branchName: undefined }); return; }
                          if (v.startsWith("id:")) { updateContact(index, { branchId: v.slice(3), branchName: undefined }); return; }
                          updateContact(index, { branchId: undefined, branchName: v.slice(5) });
                        }}
                        options={[
                          { value: "", label: l("cust.name") },
                          ...form.branches.map((b) => ({ value: b.id ? `id:${b.id}` : `name:${b.name}`, label: b.name })),
                        ]}
                      />
                    </FormRow>
                    <FormRow>
                      <Field label={l("work.mobile")} value={contact.phoneMobile ?? ""} onChange={(e) => updateContact(index, { phoneMobile: e.target.value })} />
                      <Field label={l("work.office")} value={contact.phoneLandline ?? ""} onChange={(e) => updateContact(index, { phoneLandline: e.target.value })} />
                    </FormRow>
                    <div className="flex justify-end">
                      <SecondaryButton onClick={() => removeContact(index)}>{l("common.remove")}</SecondaryButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? l("common.saving") : l("cust.save")}
          </button>
          <SecondaryButton onClick={onClose}>{l("notes.cancel")}</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

/** Strip empty strings from payload to match API expectations. */
function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === "") continue;
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null ? sanitize(item as Record<string, unknown>) : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
