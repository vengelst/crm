"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import type { TimesheetItem } from "../types";
import { cx, SectionCard, SecondaryButton, MessageBar, Field } from "../shared";
import { useI18n } from "../../../i18n-context";

export function TimesheetList({ timesheets, apiFetch, title = "Stundenzettel" }: {
  timesheets: TimesheetItem[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  title?: string;
}) {
  const { t: l } = useI18n();
  const [emailTsId, setEmailTsId] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const [tsMsg, setTsMsg] = useState<string | null>(null);

  async function downloadPdf(tsId: string) {
    try {
      const apiRoot = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3801").replace(/\/$/, "");
      const token = typeof window !== "undefined" ? (JSON.parse(window.localStorage.getItem("crm-admin-auth") ?? "{}") as { accessToken?: string }).accessToken ?? "" : "";
      const response = await fetch(`${apiRoot}/api/timesheets/${tsId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(l("ts.pdfError"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `stundenzettel-${tsId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { setTsMsg(l("ts.pdfLoadError")); }
  }

  async function sendEmail() {
    if (!emailTsId || !emailRecipient.trim()) return;
    setSending(true); setTsMsg(null);
    try {
      await apiFetch(`/timesheets/${emailTsId}/send-email`, { method: "POST", body: JSON.stringify({ recipients: emailRecipient.split(",").map((r) => r.trim()).filter(Boolean) }) });
      setTsMsg(l("ts.emailSent")); setEmailTsId(null); setEmailRecipient("");
    } catch (e) { setTsMsg(e instanceof Error ? e.message : l("common.error")); }
    finally { setSending(false); }
  }

  const statusLabel = (s: string) => {
    switch (s) { case "DRAFT": return l("ts.draft"); case "WORKER_SIGNED": return l("ts.workerSigned"); case "CUSTOMER_SIGNED": return l("ts.customerSigned"); case "COMPLETED": return l("ts.completed"); case "APPROVED": return l("ts.approved"); case "BILLED": return l("ts.billed"); case "LOCKED": return l("ts.locked"); default: return s; }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "DRAFT": return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
      case "WORKER_SIGNED": return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400";
      case "CUSTOMER_SIGNED": return "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400";
      case "COMPLETED": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400";
      case "APPROVED": return "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400";
      case "BILLED": return "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400";
      case "LOCKED": return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  async function approveTs(tsId: string) {
    setTsMsg(null);
    try {
      await apiFetch(`/timesheets/${tsId}/approve`, { method: "POST", body: JSON.stringify({}) });
      setTsMsg(l("ts.approvedMsg"));
    } catch (e) { setTsMsg(e instanceof Error ? e.message : l("common.error")); }
  }

  async function markBilledTs(tsId: string) {
    setTsMsg(null);
    try {
      await apiFetch(`/timesheets/${tsId}/mark-billed`, { method: "POST", body: JSON.stringify({}) });
      setTsMsg(l("ts.billedMsg"));
    } catch (e) { setTsMsg(e instanceof Error ? e.message : l("common.error")); }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <h4 className="mb-3 text-base font-semibold">{title}</h4>
      {tsMsg ? <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{tsMsg}</div> : null}
      {timesheets.length === 0 ? (
        <p className="text-sm text-slate-500">{l("ts.noTimesheets")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="pb-2 pr-2">{l("table.cw")}</th>
                <th className="pb-2 pr-2">{l("table.worker")}</th>
                <th className="pb-2 pr-2">{l("table.project")}</th>
                <th className="pb-2 pr-2 text-right">{l("table.netto")}</th>
                <th className="pb-2 pr-2">{l("table.status")}</th>
                <th className="pb-2 pr-2">{l("table.signed")}</th>
                <th className="pb-2">{l("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((ts) => (
                <tr key={ts.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-2 font-mono text-xs">{ts.weekNumber}/{ts.weekYear}</td>
                  <td className="py-2 pr-2 text-xs">{ts.worker ? `${ts.worker.firstName} ${ts.worker.lastName}` : "-"}</td>
                  <td className="py-2 pr-2 text-xs">{ts.project.projectNumber}</td>
                  <td className="py-2 pr-2 text-right font-mono text-xs">{Math.floor(ts.totalMinutesNet / 60)}h {ts.totalMinutesNet % 60}m</td>
                  <td className="py-2 pr-2 text-xs">
                    <span className={cx("inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", statusColor(ts.status))}>
                      {statusLabel(ts.status)}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-xs">{ts.signatures.length > 0 ? `${ts.signatures.length}x` : "-"}</td>
                  <td className="py-2 text-xs">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => void downloadPdf(ts.id)} className="rounded border border-black/10 px-1.5 py-0.5 text-[10px] hover:bg-slate-50 dark:border-white/10">PDF</button>
                      <button type="button" onClick={() => { setEmailTsId(ts.id); setEmailRecipient(""); }} className="rounded border border-blue-300 px-1.5 py-0.5 text-[10px] text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-400">Mail</button>
                      {(ts.status === "COMPLETED" || ts.status === "CUSTOMER_SIGNED") ? (
                        <button type="button" onClick={() => void approveTs(ts.id)} className="rounded border border-green-300 px-1.5 py-0.5 text-[10px] text-green-700 hover:bg-green-50 dark:border-green-500/30 dark:text-green-400">Freigeben</button>
                      ) : null}
                      {ts.status === "APPROVED" ? (
                        <button type="button" onClick={() => void markBilledTs(ts.id)} className="rounded border border-purple-300 px-1.5 py-0.5 text-[10px] text-purple-700 hover:bg-purple-50 dark:border-purple-500/30 dark:text-purple-400">Abgerechnet</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {emailTsId ? (
        <div className="mt-3 rounded-xl border-2 border-blue-300 bg-blue-50/50 p-3 dark:border-blue-500/30 dark:bg-blue-500/5">
          <div className="grid gap-2">
            <Field label={l("ts.recipientShort")} value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" disabled={sending} onClick={() => void sendEmail()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{sending ? l("ts.sending") : l("ts.send")}</button>
              <SecondaryButton onClick={() => setEmailTsId(null)}>{l("common.cancel")}</SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


// WorkerTimesheetSection moved to ./crm-app/worker/

