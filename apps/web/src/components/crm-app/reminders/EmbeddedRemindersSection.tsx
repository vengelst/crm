"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n-context";
import type { OfficeReminderItem, ReminderReferenceData } from "../types";
import {
  CollapseIndicator,
  CollapsibleContent,
  Field,
  FormRow,
  MessageBar,
  SecondaryButton,
  SelectField,
  TextArea,
  cx,
} from "../shared";

/** Aggregierte Anzahlen, wie sie der `/reminders/counts`-Endpoint liefert. */
export type ReminderCounts = {
  byCustomer: Record<string, number>;
  byProject: Record<string, number>;
};

type Scope =
  | { kind: "customer"; customerId: string }
  | { kind: "project"; projectId: string; customerId?: string };

/**
 * Sektion, die Wiedervorlagen (`OfficeReminder` mit `kind=FOLLOW_UP`) im
 * Kontext von Kunde oder Projekt einbettet. Holt nur die relevanten Eintraege
 * via Filter-Query, gruppiert nach Status/Dringlichkeit und bietet ein
 * Inline-Anlageformular ohne Umweg ueber Einstellungen → Erinnerungen.
 *
 * Die Vollverwaltung (Kanaele, Bearbeitung) bleibt im Reminder-Modul; "Im
 * Erinnerungsmodul oeffnen" deep-linkt dorthin.
 */
export function EmbeddedRemindersSection({
  scope,
  apiFetch,
  currentUserId,
  onChanged,
}: {
  scope: Scope;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Default-Verantwortlicher, wenn der Nutzer Office/Admin ist. */
  currentUserId: string;
  /** Nach jedem Anlegen / Aendern aufgerufen, damit Eltern Counts neu laden. */
  onChanged?: () => void;
}) {
  const { t: l, locale } = useI18n();
  const [items, setItems] = useState<OfficeReminderItem[] | null>(null);
  const [users, setUsers] = useState<ReminderReferenceData["users"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filterQuery =
    scope.kind === "customer"
      ? `kind=FOLLOW_UP&customerId=${encodeURIComponent(scope.customerId)}`
      : `kind=FOLLOW_UP&projectId=${encodeURIComponent(scope.projectId)}`;

  const loadItems = useCallback(async () => {
    setError(null);
    try {
      const list = await apiFetch<OfficeReminderItem[]>(`/reminders/items?${filterQuery}`);
      setItems(list);
      setPermissionDenied(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      // Office-Berechtigung fehlt → Sektion versteckt sich freundlich.
      if (/403|forbidden|verweigert|denied/i.test(message)) {
        setPermissionDenied(true);
        setItems([]);
      } else {
        setError(message || l("common.error"));
      }
    }
  }, [apiFetch, filterQuery, l]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Reference-Data nur einmal laden, damit der Anlagedialog Verantwortliche zur
  // Auswahl hat. Schlaegt das fehl (z. B. Berechtigung), bleibt die Liste leer
  // und das Formular faellt auf den aktuellen Nutzer zurueck.
  const loadUsers = useCallback(async () => {
    try {
      const ref = await apiFetch<ReminderReferenceData>(`/reminders/reference-data`);
      setUsers(ref.users);
    } catch {
      // ignorieren
    }
  }, [apiFetch]);

  function openForm() {
    setShowForm(true);
    if (users.length === 0) void loadUsers();
  }

  // Gruppierung: heute/überfällig (open, dueAt|remindAt < jetzt + 24h) > offen > erledigt
  const groups = useMemo(() => {
    const overdue: OfficeReminderItem[] = [];
    const open: OfficeReminderItem[] = [];
    const done: OfficeReminderItem[] = [];
    if (!items) return { overdue, open, done };
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const item of items) {
      if (item.status === "OPEN") {
        const ref = item.dueAt
          ? new Date(item.dueAt).getTime()
          : new Date(item.remindAt).getTime();
        if (ref <= now + dayMs) {
          overdue.push(item);
        } else {
          open.push(item);
        }
      } else if (item.status === "COMPLETED") {
        done.push(item);
      }
      // CANCELED wird hier nicht angezeigt (selten, gehoert in die Vollverwaltung)
    }
    return { overdue, open, done };
  }, [items]);

  async function complete(id: string) {
    try {
      await apiFetch(`/reminders/items/${id}/complete`, { method: "POST" });
      await loadItems();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  async function reopen(id: string) {
    try {
      await apiFetch(`/reminders/items/${id}/reopen`, { method: "POST" });
      await loadItems();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm(l("reminder.confirmDelete"))) return;
    try {
      await apiFetch(`/reminders/items/${id}`, { method: "DELETE" });
      await loadItems();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  if (permissionDenied) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="mb-1 text-base font-semibold text-slate-700 dark:text-slate-200">
          {l("reminder.embedTitle")}
        </h4>
        <p>{l("reminder.permissionMissing")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold">{l("reminder.embedTitle")}</h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openForm}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            {l("reminder.add")}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">{l("reminder.embedHint")}</p>

      <MessageBar error={error} success={success} />

      {showForm ? (
        <CreateReminderForm
          scope={scope}
          users={users}
          currentUserId={currentUserId}
          submitting={submitting}
          onSubmit={async (payload) => {
            setSubmitting(true);
            setError(null);
            try {
              await apiFetch(`/reminders/items`, {
                method: "POST",
                body: JSON.stringify(payload),
              });
              setSuccess(l("reminder.formTitle"));
              setShowForm(false);
              await loadItems();
              onChanged?.();
              setTimeout(() => setSuccess(null), 2000);
            } catch (e) {
              setError(e instanceof Error ? e.message : l("common.error"));
            } finally {
              setSubmitting(false);
            }
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {items === null ? (
        <p className="mt-2 text-sm text-slate-500">{l("common.loading")}</p>
      ) : items.length === 0 && !showForm ? (
        <p className="mt-2 text-sm text-slate-500">{l("reminder.empty")}</p>
      ) : (
        <div className="mt-3 grid gap-4">
          {groups.overdue.length > 0 ? (
            <ReminderGroup
              heading={l("reminder.groupOverdue")}
              tone="amber"
              items={groups.overdue}
              locale={locale}
              showProject={scope.kind === "customer"}
              onComplete={complete}
              onDelete={remove}
            />
          ) : null}
          {groups.open.length > 0 ? (
            <ReminderGroup
              heading={l("reminder.groupOpen")}
              tone="slate"
              items={groups.open}
              locale={locale}
              showProject={scope.kind === "customer"}
              onComplete={complete}
              onDelete={remove}
            />
          ) : null}
          {groups.done.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {l("reminder.groupCompleted")} ({groups.done.length})
                </h5>
                <CollapseIndicator open={showCompleted} />
              </button>
              <CollapsibleContent open={showCompleted}>
                <ReminderList
                  items={groups.done}
                  locale={locale}
                  showProject={scope.kind === "customer"}
                  tone="completed"
                  onComplete={complete}
                  onReopen={reopen}
                  onDelete={remove}
                />
              </CollapsibleContent>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReminderGroup({
  heading,
  tone,
  items,
  locale,
  showProject,
  onComplete,
  onDelete,
}: {
  heading: string;
  tone: "amber" | "slate";
  items: OfficeReminderItem[];
  locale: string;
  showProject: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h5
        className={cx(
          "mb-2 text-xs font-semibold uppercase tracking-wider",
          tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-slate-500",
        )}
      >
        {heading}
      </h5>
      <ReminderList
        items={items}
        locale={locale}
        showProject={showProject}
        tone={tone}
        onComplete={onComplete}
        onDelete={onDelete}
      />
    </div>
  );
}

function ReminderList({
  items,
  locale,
  showProject,
  tone,
  onComplete,
  onReopen,
  onDelete,
}: {
  items: OfficeReminderItem[];
  locale: string;
  showProject: boolean;
  tone: "amber" | "slate" | "completed";
  onComplete: (id: string) => void;
  onReopen?: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t: l } = useI18n();
  const wrapperClass =
    tone === "amber"
      ? "border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5"
      : tone === "completed"
        ? "border-black/5 bg-slate-50/30 text-slate-500 dark:border-white/5 dark:bg-slate-900/40"
        : "border-black/10 bg-white/60 dark:border-white/10 dark:bg-slate-900/40";

  return (
    <div className="grid gap-2">
      {items.map((item) => {
        const remindDate = new Date(item.remindAt);
        const dueDate = item.dueAt ? new Date(item.dueAt) : null;
        return (
          <div
            key={item.id}
            className={cx("grid gap-1 rounded-xl border px-3 py-2 text-sm", wrapperClass)}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={cx("font-medium", tone === "completed" ? "line-through" : "")}>
                  {item.title}
                </div>
                <div className="text-xs text-slate-500">
                  {l("reminder.fieldRemindAt")}: {remindDate.toLocaleString(locale)}
                  {dueDate ? <> · {l("reminder.fieldDueAt")}: {dueDate.toLocaleString(locale)}</> : null}
                  {item.assignedUser ? <> · {item.assignedUser.displayName}</> : null}
                </div>
                {item.description ? (
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.description}</div>
                ) : null}
                {showProject && item.project ? (
                  <div className="mt-1 text-xs">
                    <span className="text-slate-400">{l("reminder.linkProject")}: </span>
                    <Link href={`/projects/${item.project.id}`} className="hover:underline">
                      {item.project.projectNumber} · {item.project.title}
                    </Link>
                  </div>
                ) : null}
                {item.contact ? (
                  <div className="mt-1 text-xs">
                    <span className="text-slate-400">{l("reminder.linkContact")}: </span>
                    {item.contact.firstName} {item.contact.lastName}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {tone === "completed" && onReopen ? (
                  <button
                    type="button"
                    onClick={() => onReopen(item.id)}
                    className="rounded-lg border border-black/10 bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    {l("reminder.actionReopen")}
                  </button>
                ) : null}
                {tone !== "completed" ? (
                  <button
                    type="button"
                    onClick={() => onComplete(item.id)}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    {l("reminder.actionComplete")}
                  </button>
                ) : null}
                <Link
                  href={`/settings?tab=reminders&itemId=${encodeURIComponent(item.id)}`}
                  className="rounded-lg border border-black/10 bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  {l("reminder.actionEdit")}
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="rounded-lg border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400"
                >
                  {l("reminder.actionDelete")}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreateReminderForm({
  scope,
  users,
  currentUserId,
  submitting,
  onSubmit,
  onCancel,
}: {
  scope: Scope;
  users: ReminderReferenceData["users"];
  currentUserId: string;
  submitting: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { t: l } = useI18n();
  // Default Erinnerung: morgen 09:00 lokal.
  const defaultRemind = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }, []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [remindAt, setRemindAt] = useState(defaultRemind);
  const [dueAt, setDueAt] = useState("");
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);

  const userOptions = users.length > 0
    ? users.map((u) => ({ value: u.id, label: u.displayName || u.email }))
    : [{ value: currentUserId, label: l("reminder.fieldAssignee") }];

  function submit() {
    if (!title.trim()) return;
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      kind: "FOLLOW_UP",
      assignedUserId,
      remindAt: new Date(remindAt).toISOString(),
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      channels: ["IN_APP"],
    };
    if (scope.kind === "customer") {
      payload.customerId = scope.customerId;
    } else {
      payload.projectId = scope.projectId;
      if (scope.customerId) payload.customerId = scope.customerId;
    }
    void onSubmit(payload);
  }

  return (
    <div className="mb-3 mt-2 grid gap-3 rounded-xl border-2 border-blue-200 bg-blue-50/40 p-3 dark:border-blue-500/30 dark:bg-blue-500/5">
      <h5 className="text-sm font-semibold">{l("reminder.formTitle")}</h5>
      <FormRow>
        <Field
          label={l("reminder.fieldTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <SelectField
          label={l("reminder.fieldAssignee")}
          value={assignedUserId}
          onChange={(e) => setAssignedUserId(e.target.value)}
          options={userOptions}
        />
      </FormRow>
      <FormRow>
        <Field
          label={l("reminder.fieldRemindAt")}
          type="datetime-local"
          value={remindAt}
          onChange={(e) => setRemindAt(e.target.value)}
        />
        <Field
          label={l("reminder.fieldDueAt")}
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />
      </FormRow>
      <TextArea
        label={l("reminder.fieldDescription")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting || !title.trim() || !assignedUserId || !remindAt}
          onClick={submit}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
        >
          {submitting ? l("common.saving") : l("common.save")}
        </button>
        <SecondaryButton onClick={onCancel}>{l("common.cancel")}</SecondaryButton>
      </div>
    </div>
  );
}
