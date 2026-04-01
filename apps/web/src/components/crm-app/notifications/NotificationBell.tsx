"use client";
import { useI18n } from "../../../i18n-context";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationItem } from "../types";
import { cx } from "../shared";

export function NotificationBell({ apiFetch }: { apiFetch: <T>(path: string, init?: RequestInit) => Promise<T> }) {
  const { t: l, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const loadCount = useCallback(async () => {
    const data = await apiFetch<{ count: number }>("/notifications/unread-count").catch(() => ({ count: 0 }));
    setUnread(data.count);
  }, [apiFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCount();
    }, 0);
    const interval = setInterval(() => void loadCount(), 60000);
    return () => {
      window.clearTimeout(timer);
      clearInterval(interval);
    };
  }, [loadCount]);

  async function openPanel() {
    const data = await apiFetch<NotificationItem[]>("/notifications").catch(() => []);
    setItems(data);
    setOpen(true);
  }

  async function markRead(id: string) {
    await apiFetch(`/notifications/${id}/read`, { method: "POST" }).catch(() => {});
    setItems((c) => c.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnread((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await apiFetch("/notifications/read-all", { method: "POST" }).catch(() => {});
    setItems((c) => c.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  const typeLabel = (type: string) => {
    switch (type) {
      case "ASSIGNMENT": return l("notif.typeAssignment");
      case "SIGNATURE": return l("notif.typeSignature");
      case "APPROVAL": return l("notif.typeApproval");
      case "MISSING_TIME": return l("notif.typeMissingTime");
      case "REMINDER": return l("notif.typeReminder");
      default: return l("notif.typeInfo");
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => open ? setOpen(false) : void openPanel()}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
        title={l("notif.title")}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-h-96 overflow-auto rounded-2xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
            <span className="text-sm font-semibold">{l("notif.title")}</span>
            {items.some((n) => !n.read) ? (
              <button type="button" onClick={() => void markAllRead()} className="text-xs text-blue-600 hover:underline dark:text-blue-400">{l("notif.readAll")}</button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">{l("notif.none")}</div>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {items.map((n) => (
                <button key={n.id} type="button" onClick={() => {
                  if (!n.read) void markRead(n.id);
                  if (n.linkType && n.linkId) {
                    const path = n.linkType === "PROJECT" ? `/projects/${n.linkId}`
                      : n.linkType === "CUSTOMER" ? `/customers/${n.linkId}`
                      : n.linkType === "DOCUMENT" ? `/projects`
                      : n.linkType === "TIMESHEET" ? `/projects`
                      : null;
                    if (path) { setOpen(false); router.push(path); }
                  }
                }}
                  className={cx("w-full px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800", !n.read ? "bg-blue-50/50 dark:bg-blue-500/5" : "")}>
                  <div className="flex items-start gap-2">
                    <span className={cx("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                      n.type === "ASSIGNMENT" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" :
                      n.type === "SIGNATURE" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400" :
                      n.type === "APPROVAL" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" :
                      n.type === "REMINDER" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" :
                      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    )}>{typeLabel(n.type)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body ? <div className="mt-0.5 text-xs text-slate-500">{n.body}</div> : null}
                      <div className="mt-1 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString(locale)}</div>
                    </div>
                    {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" /> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
