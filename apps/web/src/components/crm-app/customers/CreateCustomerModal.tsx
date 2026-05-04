"use client";

import { useState } from "react";
import { useI18n } from "../../../i18n-context";
import { SecondaryButton } from "../shared";
import type { CustomerFormState } from "../types";
import { CustomerFormBody, customerFormToPayload } from "./CustomerFormBody";

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

/**
 * Geführter Kundenaufbau – Schritt 1.
 *
 * Beim Anlegen werden bewusst nur die zentralen Stammdaten erfasst (Nummer,
 * Firmenname, E-Mail, Telefon, Hauptadresse). Standorte, Ansprechpartner und
 * weitere Zusatzdaten werden anschließend im Kundendetail über klar sichtbare
 * Folge-Aktionen ergänzt.
 */
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

  async function handleSubmit() {
    if (!form.companyName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{ id: string }>("/customers", {
        method: "POST",
        body: JSON.stringify(customerFormToPayload(form)),
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
        className="w-full max-w-2xl rounded-2xl border-2 border-blue-300 bg-white p-6 shadow-xl dark:border-blue-500/40 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{l("cust.createTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">{l("cust.createBasicsHint")}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <CustomerFormBody form={form} setForm={setForm} sections={["basics"]} />
        </div>

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
