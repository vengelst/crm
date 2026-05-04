"use client";
import { useI18n } from "../../../i18n-context";
import { useSearchParams } from "next/navigation";

import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useState } from "react";
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
import { EntityList } from "../dashboard";

/**
 * Untergruppen-IDs (entsprechen den bisherigen flachen Tabs). Werden weiter
 * als Deep-Link-Wert via `?tab=...` akzeptiert, damit existierende Links nicht
 * brechen.
 */
type SettingsTab =
  | "general"
  | "users"
  | "roles"
  | "company"
  | "pdfconfig"
  | "smtp"
  | "backup"
  | "gcal"
  | "devices"
  | "templates"
  | "reminders";

/** Hauptgruppen — alltagsnahe Themen zuerst, technische Themen am Ende. */
type SettingsGroupId = "general" | "users" | "reminders" | "company" | "system";

/**
 * Mapping: jede Untergruppe gehoert zu genau einer Hauptgruppe. Wird sowohl
 * fuer das Rendering als auch fuer den Deep-Link-Fallback genutzt.
 */
const SETTINGS_GROUP_OF: Record<SettingsTab, SettingsGroupId> = {
  general: "general",
  users: "users",
  roles: "users",
  reminders: "reminders",
  company: "company",
  pdfconfig: "company",
  templates: "company",
  smtp: "system",
  backup: "system",
  gcal: "system",
  devices: "system",
};

/**
 * Fuer jede Hauptgruppe die enthaltenen Untergruppen in Anzeige-Reihenfolge.
 * Entries die mit `requiresUserManagement: true` markiert sind, fallen ohne
 * `canManageUsers` automatisch raus.
 */
const SETTINGS_GROUP_TABS: Record<
  SettingsGroupId,
  Array<{ key: SettingsTab; requiresUserManagement?: boolean }>
> = {
  general: [{ key: "general" }],
  users: [
    { key: "users", requiresUserManagement: true },
    { key: "roles", requiresUserManagement: true },
  ],
  reminders: [{ key: "reminders" }],
  company: [{ key: "company" }, { key: "pdfconfig" }, { key: "templates" }],
  system: [
    { key: "smtp" },
    { key: "backup" },
    { key: "gcal" },
    { key: "devices" },
  ],
};

const SETTINGS_GROUP_ORDER: SettingsGroupId[] = [
  "general",
  "users",
  "reminders",
  "company",
  "system",
];

function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return (
    value === "general" ||
    value === "users" ||
    value === "roles" ||
    value === "company" ||
    value === "pdfconfig" ||
    value === "smtp" ||
    value === "backup" ||
    value === "gcal" ||
    value === "devices" ||
    value === "templates" ||
    value === "reminders"
  );
}

function isSettingsGroupId(value: string | null | undefined): value is SettingsGroupId {
  return (
    value === "general" ||
    value === "users" ||
    value === "reminders" ||
    value === "company" ||
    value === "system"
  );
}

/**
 * Sichtbarkeit der Hauptgruppe in der oberen Navigation.
 *
 * `users` ist die einzige Gruppe, die ausschliesslich aus Untergruppen mit
 * `requiresUserManagement: true` besteht. Ohne `canManageUsers` haette die
 * Gruppe keine bedienbaren Inhalte, deshalb verstecken wir sie komplett —
 * keine inkonsistente "leere Gruppe aktiv"-Situation.
 *
 * Alle anderen Gruppen sind allgemein verfuegbar; sollten dort einzelne
 * Untergruppen kuenftig berechtigungspflichtig werden, greift weiterhin der
 * pro-Sub-Tab-Filter (`requiresUserManagement`).
 */
function canShowGroup(group: SettingsGroupId, canManageUsers: boolean): boolean {
  if (group === "users") return canManageUsers;
  return true;
}

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
  const { t: l } = useI18n();
  const searchParams = useSearchParams();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>("general");
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

  /**
   * Deep-Link-Verhalten: alte `?tab=<sub>`-Aufrufe (z. B. `?tab=reminders`)
   * landen weiterhin direkt im richtigen Unterbereich. Wir setzen zusaetzlich
   * die zugehoerige Hauptgruppe, damit auch die obere Navigation passt.
   * Auch ein `?group=<id>` wird akzeptiert, falls eine Stelle direkt eine
   * Hauptgruppe oeffnen will.
   *
   * Berechtigungs-Fallback: zielt der Deep-Link auf einen Bereich, fuer den
   * der Nutzer keine Rechte hat (z. B. `?tab=users` ohne `canManageUsers`),
   * landet er graceful im Allgemein-Bereich, statt in einer leeren Gruppe.
   */
  useEffect(() => {
    const requestedGroup = searchParams.get("group");
    const requestedTab = searchParams.get("tab");
    if (isSettingsTab(requestedTab)) {
      const targetGroup = SETTINGS_GROUP_OF[requestedTab];
      if (canShowGroup(targetGroup, canManageUsers)) {
        setSettingsTab(requestedTab);
        setActiveGroup(targetGroup);
      } else {
        setActiveGroup("general");
        setSettingsTab("general");
      }
      return;
    }
    if (isSettingsGroupId(requestedGroup)) {
      if (!canShowGroup(requestedGroup, canManageUsers)) {
        setActiveGroup("general");
        setSettingsTab("general");
        return;
      }
      setActiveGroup(requestedGroup);
      const firstTab = SETTINGS_GROUP_TABS[requestedGroup].find(
        (entry) => !entry.requiresUserManagement || canManageUsers,
      );
      if (firstTab) setSettingsTab(firstTab.key);
    }
  }, [searchParams, canManageUsers]);

  /**
   * Invariante: die aktive Hauptgruppe muss fuer den Nutzer sichtbar sein.
   * Wird das Recht zur Laufzeit entzogen oder ein nicht erlaubter Initialwert
   * geladen, faellt der Bereich automatisch auf "Allgemein" zurueck.
   */
  useEffect(() => {
    if (!canShowGroup(activeGroup, canManageUsers)) {
      setActiveGroup("general");
      setSettingsTab("general");
    }
  }, [activeGroup, canManageUsers]);

  /**
   * Wenn der aktive Sub-Tab durch wechselnde Berechtigungen oder Gruppenwechsel
   * nicht mehr zur aktiven Gruppe gehoert, korrigieren wir auf den ersten
   * verfuegbaren Tab dieser Gruppe.
   */
  useEffect(() => {
    if (SETTINGS_GROUP_OF[settingsTab] === activeGroup) return;
    const firstTab = SETTINGS_GROUP_TABS[activeGroup].find(
      (entry) => !entry.requiresUserManagement || canManageUsers,
    );
    if (firstTab) setSettingsTab(firstTab.key);
  }, [activeGroup, settingsTab, canManageUsers]);

  async function saveRolePermissions() {
    setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch(`/settings/roles/${selectedRoleId}/permissions`, { method: "PUT", body: JSON.stringify({ permissionIds: rolePermissionIds }) });
      setPanelSuccess(l("settings.permissionsSaved"));
    } catch (e) { setPanelError(e instanceof Error ? e.message : l("common.error")); }
  }

  async function saveSmtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/smtp", { method: "PUT", body: JSON.stringify({ ...smtpForm, port: Number(smtpForm.port) }) });
      setPanelSuccess(l("common.success"));
    } catch (err) { setPanelError(err instanceof Error ? err.message : l("common.error")); }
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
      setPanelSuccess(l("common.success"));
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : l("common.error"));
    } finally {
      setSmtpTesting(false);
    }
  }

  async function saveCompanyInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/company", { method: "PUT", body: JSON.stringify(companyForm) });
      setPanelSuccess(l("settings.companyInfoSaved"));
    } catch (err) { setPanelError(err instanceof Error ? err.message : l("common.error")); }
  }

  async function savePdfConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/pdf-config", { method: "PUT", body: JSON.stringify(pdfConfigForm) });
      setPanelSuccess(l("common.success"));
    } catch (err) { setPanelError(err instanceof Error ? err.message : l("common.error")); }
  }

  async function saveBackupConfig(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPanelError(null); setPanelSuccess(null);
    try {
      await apiFetch("/settings/backup", {
        method: "PUT",
        body: JSON.stringify({ ...backupForm, keepCount: Number(backupForm.keepCount) }),
      });
      setPanelSuccess(l("settings.backupConfigSaved"));
    } catch (err) { setPanelError(err instanceof Error ? err.message : l("common.error")); }
  }

  /** Untergruppen der aktiven Hauptgruppe, gefiltert nach Berechtigung. */
  const subTabs = SETTINGS_GROUP_TABS[activeGroup]
    .filter((entry) => !entry.requiresUserManagement || canManageUsers)
    .map((entry) => ({ key: entry.key, label: subTabLabel(entry.key, l) }));

  const permissionsByCategory = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="grid gap-6">
      {/* ── Hauptgruppen ───────────────────────────────────────── */}
      <nav aria-label={l("nav.settings")} className="grid gap-1 rounded-2xl border border-black/10 bg-white/60 p-2 dark:border-white/10 dark:bg-slate-900/40 sm:grid-cols-2 lg:grid-cols-5">
        {SETTINGS_GROUP_ORDER.filter((group) => canShowGroup(group, canManageUsers)).map((group) => {
          const labelKey = `settings.group${groupSuffix(group)}` as const;
          const hintKey = `settings.group${groupSuffix(group)}Hint` as const;
          const active = activeGroup === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => {
                setActiveGroup(group);
                setPanelSuccess(null);
                setPanelError(null);
              }}
              className={cx(
                "rounded-xl px-3 py-2 text-left text-sm transition",
                active
                  ? "bg-slate-900 text-white shadow-sm dark:bg-slate-200 dark:text-slate-950"
                  : "bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70",
              )}
            >
              <div className="font-semibold">{l(labelKey)}</div>
              <div
                className={cx(
                  "mt-0.5 text-xs",
                  active ? "text-white/80 dark:text-slate-950/70" : "text-slate-500",
                )}
              >
                {l(hintKey)}
              </div>
            </button>
          );
        })}
      </nav>

      {/* ── Untergruppen der aktiven Hauptgruppe ───────────────── */}
      {subTabs.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={l("settings.subGroupHeading")}>
          {subTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={settingsTab === t.key}
              onClick={() => {
                setSettingsTab(t.key);
                setPanelSuccess(null);
                setPanelError(null);
              }}
              className={cx(
                "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
                settingsTab === t.key
                  ? "border-blue-600 bg-blue-600 !text-white dark:border-blue-400 dark:bg-blue-500"
                  : "border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <MessageBar error={panelError ?? error} success={panelSuccess ?? success} />

      {settingsTab === "general" ? (
        <SectionCard title={l("settings.generalTitle")} subtitle={l("settings.generalSub")}>
          <form className="grid gap-4 md:max-w-2xl" onSubmit={onSettingsSubmit}>
            <FormRow>
              <Field label={l("settings.minPwLength")} type="number" value={String(settingsForm.passwordMinLength)} onChange={(e) => setSettingsForm((c) => ({ ...c, passwordMinLength: Number(e.target.value || 0) }))} />
              <Field label={l("settings.kioskPinLength")} type="number" value={String(settingsForm.kioskCodeLength)} onChange={(e) => setSettingsForm((c) => ({ ...c, kioskCodeLength: Number(e.target.value || 0) }))} />
            </FormRow>
            <SelectField label={l("settings.defaultTheme")} value={settingsForm.defaultTheme} onChange={(e) => setSettingsForm((c) => ({ ...c, defaultTheme: e.target.value as AppSettings["defaultTheme"] }))} options={[{ value: "dark", label: l("settings.dark") }, { value: "light", label: l("settings.light") }]} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settingsForm.navAsIcons} onChange={(e) => setSettingsForm((c) => ({ ...c, navAsIcons: e.target.checked }))} />
              {l("settings.navAsIcons")}
            </label>
            <PrimaryButton disabled={submitting}>{submitting ? l("common.saving") : l("settings.saveSettings")}</PrimaryButton>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "users" && canManageUsers ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title={l("settings.users")} subtitle={l("settings.userManage")}>
            <EntityList items={users} title={(i) => i.displayName}
              subtitle={(i) => `${i.email} · ${i.roles.map((r) => r.role.name).join(", ")}${i.isActive ? "" : " (inaktiv)"}`}
              titleClassName={(i) => i.isActive ? undefined : "line-through text-slate-400"}
              subtitleClassName={(i) => i.isActive ? undefined : "line-through text-slate-400"}
              editLabel={l("common.edit")} deleteLabel={l("common.delete")}
              onEdit={(i) => setUserForm({ id: i.id, email: i.email, displayName: i.displayName, notes: i.notes ?? "", password: "", kioskCode: "", roleCodes: i.roles.map((r) => r.role.code), isActive: i.isActive })}
              onDelete={(i) => onDeleteUser(i.id)} />
          </SectionCard>
          <SectionCard title={userForm.id ? l("settings.userEdit") : l("settings.userCreate")} subtitle={l("settings.userSub")}>
            <form className="grid gap-4" onSubmit={onUserSubmit}>
              {userForm.id ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {l("settings.userSecretInfo")}
                </div>
              ) : null}
              {userForm.id && !userForm.isActive ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  <span>{l("settings.userInactiveHint")}</span>
                  <button
                    type="button"
                    onClick={() => setUserForm((current) => ({ ...current, isActive: true }))}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    {l("settings.userReactivate")}
                  </button>
                </div>
              ) : null}
              <Field label={l("settings.displayName")} value={userForm.displayName} onChange={(e) => setUserForm((c) => ({ ...c, displayName: e.target.value }))} />
              <Field label={l("common.email")} value={userForm.email} onChange={(e) => setUserForm((c) => ({ ...c, email: e.target.value }))} />
              <TextArea label={l("settings.userNotes")} value={userForm.notes} onChange={(e) => setUserForm((c) => ({ ...c, notes: e.target.value }))} />
              <FormRow>
                <Field label={l("common.password")} type="password" autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm((c) => ({ ...c, password: e.target.value }))} />
                <Field label={l("settings.kioskPin")} type="password" autoComplete="new-password" value={userForm.kioskCode} onChange={(e) => setUserForm((c) => ({ ...c, kioskCode: e.target.value }))} />
              </FormRow>
              <div className="grid gap-2">
                <label className="text-sm font-medium">{l("settings.roles")}</label>
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
                <PrimaryButton disabled={submitting}>{submitting ? l("common.saving") : l("settings.userSave")}</PrimaryButton>
                <SecondaryButton onClick={() => setUserForm({ id: undefined, email: "", displayName: "", notes: "", password: "", kioskCode: "", roleCodes: [], isActive: true })}>{l("common.reset")}</SecondaryButton>
              </div>
            </form>
          </SectionCard>
        </div>
      ) : null}

      {settingsTab === "roles" && canManageUsers ? (
        <SectionCard title={l("settings.rolesTitle")} subtitle={l("settings.rolesSub")}>
          <div className="grid gap-4">
            <SelectField label={l("settings.selectRole")} value={selectedRoleId}
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
                <SecondaryButton onClick={() => void saveRolePermissions()}>{l("settings.savePermissions")}</SecondaryButton>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {settingsTab === "company" ? (
        <CompanySettingsTab companyForm={companyForm} setCompanyForm={setCompanyForm} onSave={(e) => void saveCompanyInfo(e)} submitting={submitting} apiFetch={apiFetch} setPanelSuccess={setPanelSuccess} setPanelError={setPanelError} />
      ) : null}

      {settingsTab === "pdfconfig" ? (
        <SectionCard title={l("settings.pdfConfig")} subtitle={l("settings.pdfSub")}>
          <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void savePdfConfig(e)}>
            <Field label={l("settings.pdfHeader")} value={pdfConfigForm.header} onChange={(e) => setPdfConfigForm((c) => ({ ...c, header: e.target.value }))} />
            <Field label={l("settings.pdfFooter")} value={pdfConfigForm.footer} onChange={(e) => setPdfConfigForm((c) => ({ ...c, footer: e.target.value }))} />
            <TextArea label={l("settings.pdfExtraText")} value={pdfConfigForm.extraText} onChange={(e) => setPdfConfigForm((c) => ({ ...c, extraText: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pdfConfigForm.useLogo} onChange={(e) => setPdfConfigForm((c) => ({ ...c, useLogo: e.target.checked }))} />
              {l("settings.pdfUseLogo")}
            </label>
            <PrimaryButton disabled={submitting}>{submitting ? l("common.saving") : l("settings.pdfSave")}</PrimaryButton>
          </form>
        </SectionCard>
      ) : null}

      {settingsTab === "smtp" ? (
        <SectionCard title={l("settings.smtp")} subtitle={l("settings.smtpSub")}>
          <form className="grid gap-4 md:max-w-2xl" onSubmit={(e) => void saveSmtp(e)}>
            <FormRow>
              <Field label={l("settings.smtpHost")} value={smtpForm.host} onChange={(e) => setSmtpForm((c) => ({ ...c, host: e.target.value }))} />
              <Field label={l("settings.smtpPort")} value={smtpForm.port} onChange={(e) => setSmtpForm((c) => ({ ...c, port: e.target.value }))} />
            </FormRow>
            <FormRow>
              <Field label={l("settings.smtpUser")} value={smtpForm.user} onChange={(e) => setSmtpForm((c) => ({ ...c, user: e.target.value }))} />
              <Field label={l("settings.smtpPassword")} type="password" autoComplete="new-password" value={smtpForm.password} onChange={(e) => setSmtpForm((c) => ({ ...c, password: e.target.value }))} />
            </FormRow>
            <Field label={l("settings.smtpFrom")} value={smtpForm.fromEmail} onChange={(e) => setSmtpForm((c) => ({ ...c, fromEmail: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={smtpForm.secure} onChange={(e) => setSmtpForm((c) => ({ ...c, secure: e.target.checked }))} />
              {l("settings.smtpSecure")}
            </label>
            <Field
              label={l("settings.smtpTestRecipient")}
              value={smtpTestRecipient}
              onChange={(e) => setSmtpTestRecipient(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={submitting}>{submitting ? l("common.saving") : l("settings.smtpSave")}</PrimaryButton>
              <SecondaryButton onClick={() => void testSmtp()}>
                {smtpTesting ? l("settings.smtpTesting") : l("settings.smtpTest")}
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


/** Mapping `general` → `General`, `users` → `Users` etc. fuer i18n-Key-Bau. */
function groupSuffix(group: SettingsGroupId): string {
  switch (group) {
    case "general": return "General";
    case "users": return "Users";
    case "reminders": return "Reminders";
    case "company": return "Company";
    case "system": return "System";
  }
}

/** Bezeichnung des Sub-Tabs in der Tab-Leiste. */
function subTabLabel(tab: SettingsTab, l: (key: string) => string): string {
  switch (tab) {
    case "general": return l("settings.general");
    case "users": return l("settings.users");
    case "roles": return l("settings.roles");
    case "company": return l("settings.company");
    case "pdfconfig": return l("settings.pdfConfig");
    case "smtp": return l("settings.smtp");
    case "backup": return l("settings.backup");
    case "gcal": return l("settings.gcal");
    case "devices": return l("settings.devices");
    case "templates": return l("settings.templates");
    case "reminders": return l("settings.reminders");
  }
}
