"use client";

import { useSearchParams } from "next/navigation";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n-context";
import type { OfficeReminderItem, ReminderConfig, ReminderReferenceData } from "../types";
import { apiUrl, AUTH_STORAGE_KEY } from "../types";
import { cx, Field, FormRow, SectionCard, SelectField, TextArea, PrintButton, openPrintWindow } from "../shared";
import {
  PrintConfiguratorModal,
  composeSelectedHtml,
  escapeHtml,
  SECTIONS,
  type PrintSelectionPayload,
} from "../print";

type ReminderFormState = {
  id?: string;
  title: string;
  description: string;
  kind: "TODO" | "CALLBACK" | "FOLLOW_UP";
  assignedUserId: string;
  remindAt: string;
  dueAt: string;
  channels: string[];
  smsNumber: string;
  customerId: string;
  contactId: string;
  projectId: string;
  noteId: string;
};

const emptyConfig: ReminderConfig = {
  enabled: false,
  missingTime: false,
  openSignatures: false,
  openApprovals: false,
  projectStart: false,
  emailEnabled: false,
  intervalHours: 24,
};

const emptyReferences: ReminderReferenceData = {
  users: [],
  customers: [],
  contacts: [],
  projects: [],
  notes: [],
};

const emptyForm = (): ReminderFormState => ({
  title: "",
  description: "",
  kind: "TODO",
  assignedUserId: "",
  remindAt: "",
  dueAt: "",
  channels: ["IN_APP"],
  smsNumber: "",
  customerId: "",
  contactId: "",
  projectId: "",
  noteId: "",
});

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toApiDate(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function ReminderSettings({
  apiFetch,
  setPanelSuccess,
  setPanelError,
  showSystemSection = true,
  showOfficeSection = true,
  officeListFirst = false,
  usePopupForm = false,
  canPrint = false,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: Dispatch<SetStateAction<string | null>>;
  setPanelError: Dispatch<SetStateAction<string | null>>;
  showSystemSection?: boolean;
  showOfficeSection?: boolean;
  officeListFirst?: boolean;
  usePopupForm?: boolean;
  canPrint?: boolean;
}) {
  const { t: l, locale } = useI18n();
  const searchParams = useSearchParams();
  const appliedPrefillRef = useRef("");
  const [config, setConfig] = useState<ReminderConfig>(emptyConfig);
  const [references, setReferences] = useState<ReminderReferenceData>(emptyReferences);
  const [items, setItems] = useState<OfficeReminderItem[]>([]);
  const [form, setForm] = useState<ReminderFormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [focusedItemId, setFocusedItemId] = useState("");
  const [recentlyCompletedId, setRecentlyCompletedId] = useState("");
  const [showOfficeForm, setShowOfficeForm] = useState(false);
  const [showListPrintConfig, setShowListPrintConfig] = useState(false);
  const [singlePrintTarget, setSinglePrintTarget] = useState<OfficeReminderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [running, setRunning] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextConfig, nextRefs, nextItems] = await Promise.all([
        apiFetch<ReminderConfig>("/reminders/config"),
        apiFetch<ReminderReferenceData>("/reminders/reference-data"),
        apiFetch<OfficeReminderItem[]>(`/reminders/items${statusFilter ? `?status=${statusFilter}` : ""}`),
      ]);
      setConfig(nextConfig);
      setReferences(nextRefs);
      setItems(nextItems);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, l, setPanelError, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!form.assignedUserId && references.users.length > 0) {
      setForm((current) => ({ ...current, assignedUserId: references.users[0].id }));
    }
  }, [form.assignedUserId, references.users]);

  useEffect(() => {
    if (references.users.length === 0) return;
    const queryKey = searchParams.toString();
    if (!queryKey || appliedPrefillRef.current === queryKey) return;

    const customerId = searchParams.get("customerId") ?? "";
    const contactId = searchParams.get("contactId") ?? "";
    const projectId = searchParams.get("projectId") ?? "";
    const noteId = searchParams.get("noteId") ?? "";
    const itemId = searchParams.get("itemId") ?? "";
    const title = searchParams.get("title") ?? "";
    const kind = searchParams.get("kind");

    if (!customerId && !contactId && !projectId && !noteId && !itemId && !title && !kind) {
      return;
    }

    appliedPrefillRef.current = queryKey;
    if (itemId) {
      setFocusedItemId(itemId);
    }
    if (usePopupForm) {
      setShowOfficeForm(true);
    }
    setForm((current) => ({
      ...current,
      title: title || current.title,
      kind:
        kind === "CALLBACK" || kind === "FOLLOW_UP" || kind === "TODO"
          ? kind
          : current.kind,
      customerId,
      contactId,
      projectId,
      noteId,
      assignedUserId: current.assignedUserId || references.users[0].id,
    }));
  }, [references.users, searchParams, usePopupForm]);

  const editItem = useCallback((item: OfficeReminderItem) => {
    if (usePopupForm) {
      setShowOfficeForm(true);
    }
    setForm({
      id: item.id,
      title: item.title,
      description: item.description ?? "",
      kind: item.kind,
      assignedUserId: item.assignedUserId,
      remindAt: toLocalInput(item.remindAt),
      dueAt: toLocalInput(item.dueAt),
      channels: item.channels,
      smsNumber: item.smsNumber ?? "",
      customerId: item.customer?.id ?? "",
      contactId: item.contact?.id ?? "",
      projectId: item.project?.id ?? "",
      noteId: item.note?.id ?? "",
    });
  }, [usePopupForm]);

  useEffect(() => {
    if (!focusedItemId || items.length === 0) return;
    const item = items.find((entry) => entry.id === focusedItemId);
    if (!item) return;
    editItem(item);
    const timer = window.setTimeout(() => setFocusedItemId(""), 3000);
    return () => window.clearTimeout(timer);
  }, [editItem, focusedItemId, items]);

  useEffect(() => {
    if (!recentlyCompletedId) return;
    const timer = window.setTimeout(() => setRecentlyCompletedId(""), 3500);
    return () => window.clearTimeout(timer);
  }, [recentlyCompletedId]);

  async function saveConfig() {
    setSavingConfig(true);
    setPanelError(null);
    try {
      const updated = await apiFetch<ReminderConfig>("/reminders/config", {
        method: "PUT",
        body: JSON.stringify(config),
      });
      setConfig(updated);
      setPanelSuccess(l("common.success"));
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSavingConfig(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setPanelError(null);
    try {
      const result = await apiFetch<{ results: string[] }>("/reminders/run", { method: "POST" });
      setPanelSuccess(l("settings.remindersRanMsg") + result.results.join(", "));
      await loadData();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setRunning(false);
    }
  }

  async function saveItem() {
    setSavingItem(true);
    setPanelError(null);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        kind: form.kind,
        assignedUserId: form.assignedUserId,
        remindAt: toApiDate(form.remindAt),
        dueAt: toApiDate(form.dueAt),
        channels: form.channels,
        smsNumber: form.smsNumber || null,
        customerId: form.customerId || null,
        contactId: form.contactId || null,
        projectId: form.projectId || null,
        noteId: form.noteId || null,
      };
      await apiFetch(
        form.id ? `/reminders/items/${form.id}` : "/reminders/items",
        {
          method: form.id ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setForm(emptyForm());
      if (usePopupForm) {
        setShowOfficeForm(false);
      }
      setPanelSuccess(l("common.success"));
      await loadData();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSavingItem(false);
    }
  }

  async function completeItem(id: string) {
    setPanelError(null);
    try {
      await apiFetch(`/reminders/items/${id}/complete`, { method: "POST" });
      setRecentlyCompletedId(id);
      if (statusFilter === "OPEN") {
        setStatusFilter("COMPLETED");
        setTimeFilter("");
      } else {
        await loadData();
      }
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  async function reopenItem(id: string) {
    setPanelError(null);
    try {
      await apiFetch(`/reminders/items/${id}/reopen`, { method: "POST" });
      await loadData();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  async function deleteItem(id: string) {
    setPanelError(null);
    try {
      await apiFetch(`/reminders/items/${id}`, { method: "DELETE" });
      if (form.id === id) {
        setForm(emptyForm());
      }
      await loadData();
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  async function downloadCalendar(id: string) {
    try {
      const rawAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);
      const parsed = rawAuth ? JSON.parse(rawAuth) as { accessToken?: string } : null;
      const response = await fetch(apiUrl(`/reminders/items/${id}/calendar.ics`), {
        headers: parsed?.accessToken ? { Authorization: `Bearer ${parsed.accessToken}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(l("common.error"));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `erinnerung-${id}.ics`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  function toggleChannel(channel: string) {
    setForm((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((entry) => entry !== channel)
        : [...current.channels, channel],
    }));
  }

  function reminderContext(item: OfficeReminderItem) {
    const parts: string[] = [];
    if (item.customer) parts.push(`${item.customer.customerNumber} - ${item.customer.companyName}`);
    if (item.contact) parts.push(`${item.contact.firstName} ${item.contact.lastName}`);
    if (item.project) parts.push(`${item.project.projectNumber} - ${item.project.title}`);
    if (item.note) parts.push(item.note.title || item.note.content.slice(0, 40));
    return parts.join(" | ");
  }

  const filteredItems = useMemo(() => {
    if (!timeFilter) return items;
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setHours(23, 59, 59, 999);
    const endWeek = new Date(startToday);
    endWeek.setDate(endWeek.getDate() + 7);
    endWeek.setHours(23, 59, 59, 999);

    return items.filter((item) => {
      const dueBase = item.dueAt ? new Date(item.dueAt) : new Date(item.remindAt);
      if (timeFilter === "today") {
        return dueBase >= startToday && dueBase <= endToday;
      }
      if (timeFilter === "overdue") {
        return item.status === "OPEN" && dueBase < startToday;
      }
      if (timeFilter === "week") {
        return dueBase >= startToday && dueBase <= endWeek;
      }
      return true;
    });
  }, [items, timeFilter]);

  const itemCounts = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setHours(23, 59, 59, 999);

    let open = 0;
    let today = 0;
    let overdue = 0;
    let completed = 0;

    for (const item of items) {
      const dueBase = new Date(item.dueAt || item.remindAt);
      if (item.status === "OPEN") {
        open += 1;
        if (dueBase < startToday) {
          overdue += 1;
        }
        if (dueBase >= startToday && dueBase <= endToday) {
          today += 1;
        }
      }
      if (item.status === "COMPLETED") {
        completed += 1;
      }
    }

    return { open, today, overdue, completed };
  }, [items]);

  const toggleConfig = (key: keyof ReminderConfig) => setConfig((current) => ({ ...current, [key]: !current[key] }));

  function openCreateForm() {
    setForm(emptyForm());
    setShowOfficeForm(true);
  }

  function closeOfficeForm() {
    setForm(emptyForm());
    setShowOfficeForm(false);
  }

  const officeFormSection = (
    <SectionCard
      title={form.id ? l("settings.remindersUpdate") : l("settings.remindersCreate")}
      subtitle={l("settings.remindersOfficeSub")}
    >
      <div className="grid gap-4">
        <FormRow>
          <Field label={l("settings.remindersTitle")} value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} />
          <SelectField
            label={l("settings.remindersKind")}
            value={form.kind}
            onChange={(e) => setForm((current) => ({ ...current, kind: e.target.value as ReminderFormState["kind"] }))}
            options={[
              { value: "TODO", label: l("settings.remindersKindTodo") },
              { value: "CALLBACK", label: l("settings.remindersKindCallback") },
              { value: "FOLLOW_UP", label: l("settings.remindersKindFollowUp") },
            ]}
          />
        </FormRow>

        <TextArea label={l("settings.remindersDescription")} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />

        <FormRow>
          <SelectField
            label={l("settings.remindersAssignedUser")}
            value={form.assignedUserId}
            onChange={(e) => setForm((current) => ({ ...current, assignedUserId: e.target.value }))}
            options={references.users.map((user) => ({ value: user.id, label: `${user.displayName} (${user.email})` }))}
          />
          <Field label={l("settings.remindersRemindAt")} type="datetime-local" value={form.remindAt} onChange={(e) => setForm((current) => ({ ...current, remindAt: e.target.value }))} />
        </FormRow>

        <FormRow>
          <Field label={l("settings.remindersDueAt")} type="datetime-local" value={form.dueAt} onChange={(e) => setForm((current) => ({ ...current, dueAt: e.target.value }))} />
          <Field label={l("settings.remindersSmsNumber")} value={form.smsNumber} onChange={(e) => setForm((current) => ({ ...current, smsNumber: e.target.value }))} />
        </FormRow>

        <div className="grid gap-2">
          <label className="text-sm font-medium">{l("settings.remindersChannels")}</label>
          <div className="flex flex-wrap gap-3 text-sm">
            {[
              { key: "IN_APP", label: l("settings.remindersChannelInApp") },
              { key: "EMAIL", label: l("settings.remindersChannelEmail") },
              { key: "SMS", label: l("settings.remindersChannelSms") },
              { key: "CALENDAR", label: l("settings.remindersChannelCalendar") },
            ].map((channel) => (
              <label key={channel.key} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 dark:border-white/10">
                <input type="checkbox" checked={form.channels.includes(channel.key)} onChange={() => toggleChannel(channel.key)} />
                {channel.label}
              </label>
            ))}
          </div>
        </div>

        <FormRow>
          <SelectField
            label={l("settings.remindersCustomer")}
            value={form.customerId}
            onChange={(e) => setForm((current) => ({ ...current, customerId: e.target.value }))}
            options={references.customers.map((customer) => ({ value: customer.id, label: `${customer.customerNumber} - ${customer.companyName}` }))}
          />
          <SelectField
            label={l("settings.remindersContact")}
            value={form.contactId}
            onChange={(e) => setForm((current) => ({ ...current, contactId: e.target.value }))}
            options={references.contacts.map((contact) => ({ value: contact.id, label: `${contact.firstName} ${contact.lastName} (${contact.customer.companyName})` }))}
          />
        </FormRow>

        <FormRow>
          <SelectField
            label={l("settings.remindersProject")}
            value={form.projectId}
            onChange={(e) => setForm((current) => ({ ...current, projectId: e.target.value }))}
            options={references.projects.map((project) => ({ value: project.id, label: `${project.projectNumber} - ${project.title}` }))}
          />
          <SelectField
            label={l("settings.remindersNote")}
            value={form.noteId}
            onChange={(e) => setForm((current) => ({ ...current, noteId: e.target.value }))}
            options={references.notes.map((note) => ({ value: note.id, label: `${note.title || note.content.slice(0, 40)} (${note.id.slice(-6)})` }))}
          />
        </FormRow>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={savingItem} onClick={() => void saveItem()}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            {savingItem ? l("common.saving") : form.id ? l("settings.remindersUpdate") : l("settings.remindersCreate")}
          </button>
          <button type="button" onClick={() => setForm(emptyForm())}
            className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">
            {l("settings.remindersReset")}
          </button>
          {usePopupForm ? (
            <button
              type="button"
              onClick={closeOfficeForm}
              className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
            >
              {l("common.close")}
            </button>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );

  const officeListSection = (
    <SectionCard title={l("settings.remindersItems")} subtitle={l("settings.remindersOfficeSub")}>
      <div className="grid gap-4">
        {usePopupForm || canPrint ? (
          <div className="flex flex-wrap justify-end gap-2">
            {canPrint ? (
              <PrintButton onClick={() => setShowListPrintConfig(true)} label={l("tasks.printList")} />
            ) : null}
            {usePopupForm ? (
              <button
                type="button"
                onClick={openCreateForm}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {l("settings.remindersCreate")}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => { setStatusFilter("OPEN"); setTimeFilter(""); }}
            className={cx(
              "rounded-2xl border px-4 py-3 text-left transition hover:opacity-90",
              statusFilter === "OPEN" && !timeFilter
                ? "border-amber-400 bg-amber-100/80 dark:border-amber-300 dark:bg-amber-500/20"
                : "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10",
            )}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">{l("settings.remindersStatusOpen")}</div>
            <div className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{itemCounts.open}</div>
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter(""); setTimeFilter("today"); }}
            className={cx(
              "rounded-2xl border px-4 py-3 text-left transition hover:opacity-90",
              timeFilter === "today"
                ? "border-blue-400 bg-blue-100/80 dark:border-blue-300 dark:bg-blue-500/20"
                : "border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10",
            )}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{l("settings.remindersTimeToday")}</div>
            <div className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">{itemCounts.today}</div>
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter("OPEN"); setTimeFilter("overdue"); }}
            className={cx(
              "rounded-2xl border px-4 py-3 text-left transition hover:opacity-90",
              timeFilter === "overdue"
                ? "border-red-400 bg-red-100/80 dark:border-red-300 dark:bg-red-500/20"
                : "border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10",
            )}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">{l("settings.remindersTimeOverdue")}</div>
            <div className="mt-1 text-2xl font-bold text-red-800 dark:text-red-200">{itemCounts.overdue}</div>
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter("COMPLETED"); setTimeFilter(""); }}
            className={cx(
              "rounded-2xl border px-4 py-3 text-left transition hover:opacity-90",
              statusFilter === "COMPLETED" && !timeFilter
                ? "border-emerald-400 bg-emerald-100/80 dark:border-emerald-300 dark:bg-emerald-500/20"
                : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10",
            )}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{l("settings.remindersStatusCompleted")}</div>
            <div className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{itemCounts.completed}</div>
          </button>
        </div>

        <SelectField
          label={l("settings.remindersItems")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: l("settings.remindersStatusAll") },
            { value: "OPEN", label: l("settings.remindersStatusOpen") },
            { value: "COMPLETED", label: l("settings.remindersStatusCompleted") },
            { value: "CANCELED", label: l("settings.remindersStatusCanceled") },
          ]}
        />

        <div className="flex flex-wrap gap-2">
          {[
            { key: "", label: l("settings.remindersTimeAll") },
            { key: "today", label: l("settings.remindersTimeToday") },
            { key: "overdue", label: l("settings.remindersTimeOverdue") },
            { key: "week", label: l("settings.remindersTimeWeek") },
          ].map((filter) => (
            <button
              key={filter.key || "all"}
              type="button"
              onClick={() => setTimeFilter(filter.key)}
              className={cx(
                "rounded-xl border px-3 py-2 text-sm font-medium transition",
                timeFilter === filter.key
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-950"
                  : "border-black/10 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6 text-sm text-slate-500 dark:border-white/10">
            {l("settings.remindersNoItems")}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={cx(
                  "rounded-2xl border p-4 dark:border-white/10",
                  recentlyCompletedId === item.id
                    ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                    : "",
                  focusedItemId === item.id
                    ? "border-blue-400 bg-blue-50/40 dark:border-blue-400/60 dark:bg-blue-500/10"
                    : "border-black/10",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{item.title}</span>
                      <span className={cx(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        item.status === "OPEN"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          : item.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      )}>
                        {item.status === "OPEN"
                          ? l("settings.remindersStatusOpen")
                          : item.status === "COMPLETED"
                            ? l("settings.remindersStatusCompleted")
                            : l("settings.remindersStatusCanceled")}
                      </span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                        {item.kind === "TODO"
                          ? l("settings.remindersKindTodo")
                          : item.kind === "CALLBACK"
                            ? l("settings.remindersKindCallback")
                            : l("settings.remindersKindFollowUp")}
                      </span>
                    </div>
                    {item.description ? <div className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.description}</div> : null}
                    <div className="mt-2 grid gap-1 text-xs text-slate-500">
                      <div>{l("settings.remindersAssignedTo")}: {item.assignedUser.displayName}</div>
                      <div>{l("settings.remindersReminderAt")}: {new Date(item.remindAt).toLocaleString(locale)}</div>
                      {item.dueAt ? <div>{l("settings.remindersDueLabel")}: {new Date(item.dueAt).toLocaleString(locale)}</div> : null}
                      <div>{l("settings.remindersCreatedBy")}: {item.createdBy.displayName}</div>
                      {reminderContext(item) ? <div>{l("settings.remindersContext")}: {reminderContext(item)}</div> : null}
                      <div>{l("settings.remindersChannels")}: {item.channels.join(", ")}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => editItem(item)}
                      className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">
                      {l("common.edit")}
                    </button>
                    {canPrint ? (
                      <button type="button" onClick={() => setSinglePrintTarget(item)}
                        className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">
                        {l("common.print")}
                      </button>
                    ) : null}
                    {item.status === "OPEN" ? (
                      <button type="button" onClick={() => void completeItem(item.id)}
                        className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                        {l("settings.remindersMarkDone")}
                      </button>
                    ) : (
                      <button type="button" onClick={() => void reopenItem(item.id)}
                        className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">
                        {l("settings.remindersReopen")}
                      </button>
                    )}
                    {item.channels.includes("CALENDAR") ? (
                      <button type="button" onClick={() => void downloadCalendar(item.id)}
                        className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10">
                        {l("settings.remindersDownloadCalendar")}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void deleteItem(item.id)}
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10">
                      {l("common.delete")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );

  function renderTaskRow(item: OfficeReminderItem): string {
    const due = item.dueAt ? new Date(item.dueAt).toLocaleString(locale) : "-";
    const remind = new Date(item.remindAt).toLocaleString(locale);
    const ctx = reminderContext(item) || "-";
    return `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.kind)}</td><td>${escapeHtml(item.assignedUser.displayName)}</td><td>${escapeHtml(remind)}</td><td>${escapeHtml(due)}</td><td>${escapeHtml(ctx)}</td></tr>`;
  }

  function buildListSectionRenderers(): Record<string, () => string> {
    return {
      filters: () => `<h2>${escapeHtml(l("print.section.tasks.filters"))}</h2>
        <div class="grid">
          <span class="label">${escapeHtml(l("settings.remindersStatusAll"))}</span><span>${escapeHtml(statusFilter || l("settings.remindersStatusAll"))}</span>
          <span class="label">${escapeHtml(l("settings.remindersTimeAll"))}</span><span>${escapeHtml(timeFilter || l("settings.remindersTimeAll"))}</span>
        </div>`,
      openTasks: () => {
        const open = filteredItems.filter((i) => i.status === "OPEN");
        if (open.length === 0) return "";
        const rows = open.map(renderTaskRow).join("");
        return `<h2>${escapeHtml(l("print.section.tasks.openTasks"))} (${open.length})</h2><table><thead><tr><th>${escapeHtml(l("doc.title"))}</th><th>${escapeHtml(l("table.status"))}</th><th>${escapeHtml(l("settings.remindersAssignedTo"))}</th><th>${escapeHtml(l("settings.remindersReminderAt"))}</th><th>${escapeHtml(l("settings.remindersDueLabel"))}</th><th>${escapeHtml(l("settings.remindersContext"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      },
      completedTasks: () => {
        const done = filteredItems.filter((i) => i.status === "COMPLETED");
        if (done.length === 0) return "";
        const rows = done.map(renderTaskRow).join("");
        return `<h2>${escapeHtml(l("print.section.tasks.completedTasks"))} (${done.length})</h2><table><thead><tr><th>${escapeHtml(l("doc.title"))}</th><th>${escapeHtml(l("table.status"))}</th><th>${escapeHtml(l("settings.remindersAssignedTo"))}</th><th>${escapeHtml(l("settings.remindersReminderAt"))}</th><th>${escapeHtml(l("settings.remindersDueLabel"))}</th><th>${escapeHtml(l("settings.remindersContext"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
      },
    };
  }

  function buildSingleTaskRenderers(item: OfficeReminderItem): Record<string, () => string> {
    return {
      taskDetail: () => `<h2>${escapeHtml(item.title)}</h2>
        <div class="grid">
          <span class="label">${escapeHtml(l("table.status"))}</span><span>${escapeHtml(item.status)}</span>
          <span class="label">${escapeHtml(l("settings.remindersAssignedTo"))}</span><span>${escapeHtml(item.assignedUser.displayName)}</span>
          <span class="label">${escapeHtml(l("settings.remindersReminderAt"))}</span><span>${escapeHtml(new Date(item.remindAt).toLocaleString(locale))}</span>
          <span class="label">${escapeHtml(l("settings.remindersDueLabel"))}</span><span>${escapeHtml(item.dueAt ? new Date(item.dueAt).toLocaleString(locale) : "-")}</span>
          <span class="label">${escapeHtml(l("settings.remindersCreatedBy"))}</span><span>${escapeHtml(item.createdBy.displayName)}</span>
          <span class="label">${escapeHtml(l("settings.remindersContext"))}</span><span>${escapeHtml(reminderContext(item) || "-")}</span>
          <span class="label">${escapeHtml(l("settings.remindersChannels"))}</span><span>${escapeHtml(item.channels.join(", "))}</span>
        </div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}`,
    };
  }

  function handleListPrint(payload: PrintSelectionPayload) {
    const html = `<h1>${escapeHtml(l("settings.remindersItems"))}</h1>
      <p class="meta">${escapeHtml(new Date().toLocaleString(locale))}</p>` +
      composeSelectedHtml(payload.sections, buildListSectionRenderers());
    openPrintWindow(l("settings.remindersItems"), html);
    setShowListPrintConfig(false);
  }

  function handleSinglePrint(payload: PrintSelectionPayload, item: OfficeReminderItem) {
    const html = composeSelectedHtml(payload.sections, buildSingleTaskRenderers(item));
    openPrintWindow(item.title, html);
    setSinglePrintTarget(null);
  }

  if (loading) {
    return (
      <SectionCard title={l("settings.reminders")}>
        <p className="text-sm text-slate-500">{l("common.loading")}</p>
      </SectionCard>
    );
  }

  return (
    <div className="grid gap-6">
      {showSystemSection ? (
        <SectionCard title={l("settings.reminders")} subtitle={l("settings.remindersSub")}>
          <div className="grid gap-3 md:max-w-2xl">
            <div className="text-sm font-semibold">{l("settings.remindersSectionSystem")}</div>
            <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.enabled} onChange={() => toggleConfig("enabled")} /> {l("settings.remindersEnabled")}</label>
            <div className="ml-6 grid gap-2">
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.missingTime} onChange={() => toggleConfig("missingTime")} disabled={!config.enabled} /> {l("settings.remindersMissingTime")}</label>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.openSignatures} onChange={() => toggleConfig("openSignatures")} disabled={!config.enabled} /> {l("settings.remindersOpenSig")}</label>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.openApprovals} onChange={() => toggleConfig("openApprovals")} disabled={!config.enabled} /> {l("settings.remindersOpenApproval")}</label>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.projectStart} onChange={() => toggleConfig("projectStart")} disabled={!config.enabled} /> {l("settings.remindersProjectStart")}</label>
            </div>
            <div className="mt-2 border-t border-black/10 pt-3 dark:border-white/10">
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.emailEnabled} onChange={() => toggleConfig("emailEnabled")} disabled={!config.enabled} /> {l("settings.remindersEmailEnabled")}</label>
              <p className="ml-6 mt-1 text-xs text-slate-500">{l("settings.remindersSmsNote")}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={savingConfig} onClick={() => void saveConfig()}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
                {savingConfig ? l("common.saving") : l("settings.remindersSaveConfig")}
              </button>
              <button type="button" onClick={() => void runNow()} disabled={running || !config.enabled}
                className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-slate-800">
                {running ? l("settings.remindersRunning") : l("settings.remindersRun")}
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {showOfficeSection && officeListFirst ? officeListSection : null}
      {showOfficeSection && !usePopupForm ? officeFormSection : null}
      {showOfficeSection && !officeListFirst ? officeListSection : null}
      {showOfficeSection && usePopupForm && showOfficeForm ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pb-12 pt-12"
          onClick={closeOfficeForm}
        >
          <div
            className="w-full max-w-5xl rounded-3xl border-2 border-red-300 bg-white p-4 shadow-xl dark:border-red-500/40 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            {officeFormSection}
          </div>
        </div>
      ) : null}

      {showListPrintConfig ? (
        <PrintConfiguratorModal
          entityType="tasks"
          title={l("tasks.printList")}
          availableSections={SECTIONS.tasks.filter((s) => s.key !== "taskDetail")}
          onClose={() => setShowListPrintConfig(false)}
          onPrint={handleListPrint}
        />
      ) : null}

      {singlePrintTarget ? (
        <PrintConfiguratorModal
          entityType="tasks"
          entityId={singlePrintTarget.id}
          title={`${l("tasks.printSingle")} — ${singlePrintTarget.title}`}
          availableSections={SECTIONS.tasks.filter((s) => s.key === "taskDetail")}
          onClose={() => setSinglePrintTarget(null)}
          onPrint={(payload) => handleSinglePrint(payload, singlePrintTarget)}
        />
      ) : null}
    </div>
  );
}
