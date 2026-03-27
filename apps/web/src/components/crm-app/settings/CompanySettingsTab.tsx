"use client";

import { type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction, useEffect, useState } from "react";
import { SectionCard, SecondaryButton, PrimaryButton, FormRow, Field } from "../shared";

export function CompanySettingsTab({ companyForm, setCompanyForm, onSave, submitting, apiFetch, setPanelSuccess, setPanelError }: {
  companyForm: { name: string; street: string; postalCode: string; city: string; country: string; phone: string; email: string; website: string };
  setCompanyForm: Dispatch<SetStateAction<typeof companyForm>>;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: (v: string | null) => void;
  setPanelError: (v: string | null) => void;
}) {
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void apiFetch<{ path: string | null }>("/settings/logo").then((r) => setLogoPath(r.path)).catch(() => {});
  }, [apiFetch]);

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch<{ path: string }>("/settings/logo", { method: "POST", body: fd, headers: {} });
      setLogoPath(r.path);
      setPanelSuccess("Logo hochgeladen.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Upload fehlgeschlagen."); }
    finally { setUploading(false); }
  }

  async function deleteLogo() {
    try {
      await apiFetch("/settings/logo", { method: "DELETE" });
      setLogoPath(null);
      setPanelSuccess("Logo entfernt.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler."); }
  }

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");

  return (
    <div className="grid gap-6">
      <SectionCard title="Firmeninformationen" subtitle="Diese Daten erscheinen auf Stundenzetteln und PDFs.">
        <form className="grid gap-4 md:max-w-2xl" onSubmit={onSave}>
          <Field label="Firmenname" value={companyForm.name} onChange={(e) => setCompanyForm((c) => ({ ...c, name: e.target.value }))} />
          <Field label="Strasse / Hausnummer" value={companyForm.street} onChange={(e) => setCompanyForm((c) => ({ ...c, street: e.target.value }))} />
          <FormRow>
            <Field label="PLZ" value={companyForm.postalCode} onChange={(e) => setCompanyForm((c) => ({ ...c, postalCode: e.target.value }))} />
            <Field label="Ort" value={companyForm.city} onChange={(e) => setCompanyForm((c) => ({ ...c, city: e.target.value }))} />
          </FormRow>
          <Field label="Land" value={companyForm.country} onChange={(e) => setCompanyForm((c) => ({ ...c, country: e.target.value }))} />
          <FormRow>
            <Field label="Telefon" value={companyForm.phone} onChange={(e) => setCompanyForm((c) => ({ ...c, phone: e.target.value }))} />
            <Field label="E-Mail" value={companyForm.email} onChange={(e) => setCompanyForm((c) => ({ ...c, email: e.target.value }))} />
          </FormRow>
          <Field label="Website" value={companyForm.website} onChange={(e) => setCompanyForm((c) => ({ ...c, website: e.target.value }))} />
          <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Firmeninformationen speichern"}</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Firmenlogo" subtitle="Logo fuer Stundenzettel und PDF-Dokumente.">
        <div className="grid gap-4">
          {logoPath ? (
            <div className="flex items-center gap-4">
              <img src={`${apiRoot}/api/settings/logo/file?t=${Date.now()}`} alt="Logo" className="h-16 rounded-lg border border-black/10 dark:border-white/10" />
              <div className="grid gap-2">
                <p className="text-sm text-slate-500">Logo vorhanden</p>
                <SecondaryButton onClick={() => void deleteLogo()}>Logo entfernen</SecondaryButton>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Kein Logo hinterlegt.</p>
          )}
          <div className="grid gap-2">
            <label className="text-sm font-medium">{logoPath ? "Logo ersetzen" : "Logo hochladen"}</label>
            <input type="file" accept="image/png,image/jpeg" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900" />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

type BackupEntry = { id: string; createdAt: string; hasDatabase: boolean; databaseStatus?: string; hasSettings: boolean; settingsStatus?: string; hasDocuments: boolean; documentsStatus?: string; sizeBytes: number };

