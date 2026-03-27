"use client";

import { type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction, useCallback, useEffect, useState } from "react";
import type {
  AppSettings, UserItem, RoleItem, Worker,
  UserFormState, PermissionItem, SmtpFormState,
} from "../types";
import {
  cx, SectionCard, SecondaryButton, PrimaryButton, MessageBar,
  FormRow, Field, SelectField, TextArea,
} from "../shared";
import { CompanySettingsTab } from "./CompanySettingsTab";
import { BackupSettingsTab } from "./BackupSettingsTab";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { ChecklistTemplateSettings } from "./ChecklistTemplateSettings";
import { ReminderSettings } from "./ReminderSettings";
import { KioskDeviceSettings } from "./KioskDeviceSettings";
import { SUPPORTED_LANGUAGES } from "../../../i18n";
import { EntityList } from "../dashboard";

export function SettingsPanel({
  settingsForm, setSettingsForm, onSettingsSubmit,
  users, roles, workers, userForm, setUserForm, onUserSubmit, onDeleteUser,
  canManageUsers, submitting, apiFetch, error, success,
}: {
  settingsForm: AppSettings;
  setSettingsForm: Dispatch<SetStateAction<AppSettings>>;
  onSettingsSubmit: (e: FormEvent<HTMLFormElement>) => void;
  users: UserItem[];
  roles: RoleItem[];
  workers: Worker[];
  userForm: UserFormState;
  setUserForm: Dispatch<SetStateAction<UserFormState>>;
  onUserSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onDeleteUser: (id: string) => void;
  canManageUsers: boolean;
  submitting: boolean;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  error: string | null;
  success: string | null;
}) {
  const [settingsTab, setSettingsTab] = useState<"general" | "users" | "roles" | "company" | "pdfconfig" | "smtp" | "backup" | "gcal" | "devices" | "templates" | "reminders">("general");
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [rolePermissionIds, setRolePermissionIds] = useState<string[]>([]);
  const [smtpForm, setSmtpForm] = useState<SmtpFormState>({ host: "", port: "587", user: "", password: "", fromEmail: "", secure: false });
  const [smtpTestRecipient, setSmtpTestRecipient] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [backupForm, setBackupForm] = useState({ enabled: false, interval: "daily", time: "02:00", keepCount: "7" });
  const [companyForm, setCompanyForm] = useState({ name: "", street: "", postalCode: "", city: "", country: "DE", phone: "", email: "", website: "" });
  const [pdfConfigForm, setPdfConfigForm] = useState({ header: "", footer: "", extraText: "", useLogo: false });
  const [panelSuccess, setPanelSuccess] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<PermissionItem[]>("/settings/permissions").then(setPermissions).catch(() => setPermissions([]));
  }, [apiFetch]);

  useEffect(() => {
    void apiFetch<{ host: string; port: number; user: string; password: string; fromEmail: string; secure: boolean }>("/settings/smtp")
      .then((s) => {
        setSmtpForm({ host: s.host ?? "", port: String(s.port ?? 587), user: s.user ?? "", password: s.password ?? "", fromEmail: s.fromEmail ?? "", secure: s.secure ?? false });
        setSmtpTestRecipient(s.fromEmail ?? "");
      })
      .catch(() => {});
    void apiFetch<{ enabled: boolean; interval: string; time: string; keepCount: number }>("/settings/backup")
      .then((b) => setBackupForm({ enabled: b.enabled, interval: b.interval, time: b.time, keepCount: String(b.keepCount) }))
      .catch(() => {});
    void apiFetch<typeof companyForm>("/settings/company").then(setCompanyForm).catch(() => {});
    void apiFetch<typeof pdfConfigForm>("/settings/pdf-config").then(setPdfConfigForm).catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    if (!selectedRoleId) { setRolePermissionIds([]); return; }
    void apiFetch<PermissionItem[]>(`/settings/roles/${selectedRoleId}/permissions`).then((perms) => setRolePermissionIds(perms.map((p) => p.id))).catch(() => {});
  }, [apiFetch, selectedRoleId]);

  async function saveRolePermissions() {
    setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch(`/settings/roles/${selectedRoleId}/permissions`, { method: "PUT", body: JSON.stringify({ permissionIds: rolePermissionIds }) });
      setPanelSuccess("Rechte gespeichert.");
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Fehler"); }
  }

  async function saveSmtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/smtp", { method: "PUT", body: JSON.stringify({ ...smtpForm, port: Number(smtpForm.port) }) });
      setPanelSuccess("SMTP gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  async function testSmtp() {
    setPanelError(null); setPanelSuccess(null); setSmtpTesting(true);
    try {
      const recipient = smtpTestRecipient.trim() || smtpForm.fromEmail.trim();
      await apiFetch("/settings/smtp/test", {
        method: "PUT",
        body: JSON.stringify({
          ...smtpForm,
          port: Number(smtpForm.port),
          recipient,
        }),
      });
      setPanelSuccess(`Test-E-Mail erfolgreich an ${recipient} gesendet.`);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSmtpTesting(false);
    }
  }

  async function saveCompanyInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/company", { method: "PUT", body: JSON.stringify(companyForm) });
      setPanelSuccess("Firmeninformationen gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  async function savePdfConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/pdf-config", { method: "PUT", body: JSON.stringify(pdfConfigForm) });
      setPanelSuccess("PDF-Konfiguration gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  async function saveBackupConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/backup", {
        method: "PUT",
        body: JSON.stringify({ ...backupForm, keepCount: Number(backupForm.keepCount) }),
      });
      setPanelSuccess("Backup-Konfiguration gespeichert.");
    } catch (err) { setPanelError(err instanceof Error ? err.message : "Fehler"); }
  }

  const tabs: { key: typeof settingsTab; label: string }[] = [
    { key: "general", label: "Allgemein" },
    ...(canManageUsers ? [{ key: "users" as const, label: "Benutzer" }] : []),
    ...(canManageUsers ? [{ key: "roles" as const, label: "Rollen & Rechte" }] : []),
    { key: "company" as const, label: "Firma" },
    { key: "pdfconfig" as const, label: "PDF" },
    { key: "smtp", label: "E-Mail / SMTP" },
    { key: "backup", label: "Backup" },
    { key: "gcal" as const, label: "Google Kalender" },
    { key: "devices" as const, label: "Kiosk-Geraete" },
    { key: "templates" as const, label: "Vorlagen" },
    { key: "reminders" as const, label: "Erinnerungen" },
  ];

  const permissionsByCategory = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => { setSettingsTab(t.key); setPanelSuccess(null); setPanelError(null); }}
            className={cx("rounded-xl border px-3 py-2 text-sm font-medium transition",
              settingsTab === t.key
                ? "border-slate-900 bg-slate-900 !text-white dark:border-slate-300 dark:bg-slate-200 dark:!text-slate-950"
                : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
            )}>{t.label}</button>
        ))}
      </div>

      <MessageBar error={panelError ?? error} success={panelSuccess ?? success} />

      {settingsTab === "general" ? (
        <SectionCard title="Allgemeine Einstellungen" subtitle="Passwort, Kiosk-PIN, Theme">
          <form className="grid gap-4 md:max-w-2xl" onSubmit={onSettingsSubmit}>
            <FormRow>
              <Field label="Minimale Passwortlaenge" type="number" value={String(settingsForm.passwordMinLength)} onChange={(e) => setSettingsForm((c) => ({ ...c, passwordMinLength: Number(e.target.value || 0) }))} />
              <Field label="Kiosk-PIN Laenge" type="number" value={String(settingsForm.kioskCodeLength)} onChange={(e) => setSettingsForm((c) => ({ ...c, kioskCodeLength: Number(e.target.value || 0) }))} />
            </FormRow>
            <SelectField label="Standard Theme" value={settingsForm.defaultTheme} onChange={(e) => setSettingsForm((c) => ({ ...c, defaultTheme: e.target.value as AppSettings["defaultTheme"] }))} options={[{ value: "dark", label: "Dunkel" }, { value: "light", label: "Hell" }]} />
            <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Einstellungen speichern"}</PrimaryButton>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "users" && canManageUsers ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Benutzer" subtitle="Benutzer verwalten, Rollen zuweisen.">
            <EntityList items={users} title={(i) => i.displayName}
              subtitle={(i) => `${i.email} · ${i.roles.map((r) => r.role.name).join(", ")}${i.isActive ? "" : " (inaktiv)"}`}
              editLabel="Bearbeiten" deleteLabel="Loeschen"
              onEdit={(i) => setUserForm({ id: i.id, email: i.email, displayName: i.displayName, password: "", kioskCode: "", roleCodes: i.roles.map((r) => r.role.code), isActive: i.isActive })}
              onDelete={(i) => onDeleteUser(i.id)} />
          </SectionCard>
          <SectionCard title={userForm.id ? "Benutzer bearbeiten" : "Benutzer anlegen"} subtitle="Login, Passwort, Kiosk-PIN und Rollen. Die Kiosk-PIN ermoeglicht eine schnelle Anmeldung am Kiosk-Terminal.">
            <form className="grid gap-4" onSubmit={onUserSubmit}>
              <Field label="Anzeigename" value={userForm.displayName} onChange={(e) => setUserForm((c) => ({ ...c, displayName: e.target.value }))} />
              <Field label="E-Mail" value={userForm.email} onChange={(e) => setUserForm((c) => ({ ...c, email: e.target.value }))} />
              <FormRow>
                <Field label="Passwort" type="password" autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm((c) => ({ ...c, password: e.target.value }))} />
                <Field label="Kiosk-PIN (fuer Kiosk-Anmeldung)" type="password" autoComplete="new-password" value={userForm.kioskCode} onChange={(e) => setUserForm((c) => ({ ...c, kioskCode: e.target.value }))} />
              </FormRow>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Rollen</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <label key={role.id} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                      <input type="checkbox" checked={userForm.roleCodes.includes(role.code)}
                        onChange={(e) => setUserForm((c) => ({ ...c, roleCodes: e.target.checked ? [...c.roleCodes, role.code] : c.roleCodes.filter((r) => r !== role.code) }))} />
                      {role.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "Benutzer speichern"}</PrimaryButton>
                <SecondaryButton onClick={() => setUserForm({ id: undefined, email: "", displayName: "", password: "", kioskCode: "", roleCodes: [], isActive: true })}>Zuruecksetzen</SecondaryButton>
              </div>
            </form>
          </SectionCard>
        </div>
      ) : null}

      {settingsTab === "roles" && canManageUsers ? (
        <SectionCard title="Rollen & Rechte" subtitle="Rechte pro Rolle konfigurieren.">
          <div className="grid gap-4">
            <SelectField label="Rolle waehlen" value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              options={roles.map((r) => ({ value: r.id, label: r.name }))} />
            {selectedRoleId ? (
              <div className="grid gap-4">
                {Object.entries(permissionsByCategory).map(([cat, perms]) => (
                  <div key={cat} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                    <h4 className="mb-2 text-sm font-semibold text-slate-500">{cat}</h4>
                    <div className="flex flex-wrap gap-2">
                      {perms.map((p) => (
                        <label key={p.id} className="inline-flex items-center gap-2 rounded-lg border border-black/5 px-2 py-1 text-xs dark:border-white/5">
                          <input type="checkbox" checked={rolePermissionIds.includes(p.id)}
                            onChange={(e) => setRolePermissionIds((c) => e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id))} />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <SecondaryButton onClick={() => void saveRolePermissions()}>Rechte speichern</SecondaryButton>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {settingsTab === "company" ? (
        <CompanySettingsTab companyForm={companyForm} setCompanyForm={setCompanyForm} onSave={(e) => void saveCompanyInfo(e)} submitting={submitting} apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "pdfconfig" ? (
        <SectionCard title="PDF-Konfiguration" subtitle="Darstellung fuer Stundenzettel und Dokumente.">
          <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void savePdfConfig(e)}>
            <Field label="PDF-Kopfzeile" value={pdfConfigForm.header} onChange={(e) => setPdfConfigForm((c) => ({ ...c, header: e.target.value }))} />
            <Field label="PDF-Fusszeile" value={pdfConfigForm.footer} onChange={(e) => setPdfConfigForm((c) => ({ ...c, footer: e.target.value }))} />
            <TextArea label="Zusatztext / Freitext" value={pdfConfigForm.extraText} onChange={(e) => setPdfConfigForm((c) => ({ ...c, extraText: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pdfConfigForm.useLogo} onChange={(e) => setPdfConfigForm((c) => ({ ...c, useLogo: e.target.checked }))} />
              Logo im PDF verwenden
            </label>
            <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "PDF-Konfiguration speichern"}</PrimaryButton>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "smtp" ? (
        <SectionCard title="E-Mail / SMTP" subtitle="Mailserver fuer Stundenzettel-Versand konfigurieren.">
          <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void saveSmtp(e)}>
            <FormRow>
              <Field label="SMTP Host" value={smtpForm.host} onChange={(e) => setSmtpForm((c) => ({ ...c, host: e.target.value }))} />
              <Field label="SMTP Port" value={smtpForm.port} onChange={(e) => setSmtpForm((c) => ({ ...c, port: e.target.value }))} />
            </FormRow>
            <FormRow>
              <Field label="SMTP Benutzer" value={smtpForm.user} onChange={(e) => setSmtpForm((c) => ({ ...c, user: e.target.value }))} />
              <Field label="SMTP Passwort" type="password" autoComplete="new-password" value={smtpForm.password} onChange={(e) => setSmtpForm((c) => ({ ...c, password: e.target.value }))} />
            </FormRow>
            <Field label="Absenderadresse" value={smtpForm.fromEmail} onChange={(e) => setSmtpForm((c) => ({ ...c, fromEmail: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={smtpForm.secure} onChange={(e) => setSmtpForm((c) => ({ ...c, secure: e.target.checked }))} />
              TLS / SSL verwenden
            </label>
            <Field
              label="Test-E-Mail an"
              value={smtpTestRecipient}
              onChange={(e) => setSmtpTestRecipient(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={submitting}>{submitting ? "Speichert ..." : "SMTP speichern"}</PrimaryButton>
              <SecondaryButton onClick={() => void testSmtp()}>
                {smtpTesting ? "Testet ..." : "SMTP testen"}
              </SecondaryButton>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "backup" ? (
        <BackupSettingsTab backupForm={backupForm} setBackupForm={setBackupForm} onSaveConfig={(e) => void saveBackupConfig(e)} submitting={submitting} apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "gcal" ? (
        <GoogleCalendarSettings apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "devices" ? (
        <KioskDeviceSettings apiFetch={apiFetch} workers={workers} users={users} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "templates" ? (
        <ChecklistTemplateSettings apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "reminders" ? (
        <ReminderSettings apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}
    </div>
  );
}
