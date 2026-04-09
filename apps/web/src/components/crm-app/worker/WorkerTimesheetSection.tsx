"use client";

import { useCallback, useEffect, useState } from "react";
import { apiUrl, type TimesheetItem } from "../types";
import { SectionCard, SecondaryButton, MessageBar, Field } from "../shared";
import { useI18n } from "../../../i18n-context";

export function WorkerTimesheetSection({
  workerId,
  projects,
  apiFetch,
}: {
  workerId: string;
  projects: { id: string; projectNumber: string; title: string }[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const { t: l } = useI18n();
  const [timesheets, setTimesheets] = useState<TimesheetItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);
  const [tsError, setTsError] = useState<string | null>(null);
  const [tsSuccess, setTsSuccess] = useState<string | null>(null);
  const [signCanvasRef, setSignCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const [signingTsId, setSigningTsId] = useState<string | null>(null);
  const [emailTsId, setEmailTsId] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");

  const loadTimesheets = useCallback(async () => {
    try {
      const all = await apiFetch<TimesheetItem[]>(`/timesheets/weekly?workerId=${workerId}`);
      setTimesheets(all);
    } catch { /* ignore */ }
  }, [apiFetch, workerId]);

  useEffect(() => { void loadTimesheets(); }, [loadTimesheets]);

  const now = new Date();
  const currentWeekYear = now.getFullYear();
  const janFirst = new Date(currentWeekYear, 0, 1);
  const currentWeekNumber = Math.ceil(((now.getTime() - janFirst.getTime()) / 86400000 + janFirst.getDay() + 1) / 7);

  async function generateTimesheet(projectId: string) {
    setGenerating(true); setTsError(null); setTsSuccess(null);
    try {
      await apiFetch("/timesheets/weekly", {
        method: "POST",
        body: JSON.stringify({ workerId, projectId, weekYear: currentWeekYear, weekNumber: currentWeekNumber }),
      });
      setTsSuccess(l("ts.generatedMsg"));
      await loadTimesheets();
    } catch (e) { setTsError(e instanceof Error ? e.message : l("common.error")); }
    finally { setGenerating(false); }
  }

  async function signTimesheet() {
    if (!signingTsId || !signCanvasRef) return;
    setSigning(true); setTsError(null);
    try {
      const signatureImagePath = signCanvasRef.toDataURL("image/png");
      await apiFetch(`/timesheets/${signingTsId}/worker-sign`, {
        method: "POST",
        body: JSON.stringify({ signerName: "Monteur", signatureImagePath, deviceInfo: "web" }),
      });
      setTsSuccess(l("ts.signedMsg"));
      setSigningTsId(null);
      await loadTimesheets();
    } catch (e) { setTsError(e instanceof Error ? e.message : l("common.error")); }
    finally { setSigning(false); }
  }

  async function sendTimesheetEmail() {
    if (!emailTsId || !emailRecipient.trim()) { setTsError(l("ts.enterRecipient")); return; }
    setSending(true); setTsError(null); setTsSuccess(null);
    try {
      const recipients = emailRecipient.split(",").map((r) => r.trim()).filter(Boolean);
      await apiFetch(`/timesheets/${emailTsId}/send-email`, {
        method: "POST",
        body: JSON.stringify({ recipients }),
      });
      setTsSuccess(`${l("ts.emailSentTo")} ${recipients.join(", ")}.`);
      setEmailTsId(null);
      setEmailRecipient("");
    } catch (e) { setTsError(e instanceof Error ? e.message : l("ts.sendFailed")); }
    finally { setSending(false); }
  }

  async function downloadPdf(tsId: string) {
    try {
      const response = await fetch(apiUrl(`/timesheets/${tsId}/pdf`), {
        headers: { Authorization: `Bearer ${typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem("crm-admin-auth") ?? "{}").accessToken ?? "" : ""}` },
      });
      if (!response.ok) throw new Error(l("ts.pdfLoadError"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `stundenzettel-${tsId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setTsError(e instanceof Error ? e.message : l("ts.pdfError")); }
  }

  function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function initSignCanvas(canvas: HTMLCanvasElement | null) {
    setSignCanvasRef(canvas);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let drawing = false;
    canvas.onpointerdown = (e) => {
      drawing = true;
      const point = getCanvasPoint(canvas, e);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    };
    canvas.onpointermove = (e) => {
      if (!drawing) return;
      const point = getCanvasPoint(canvas, e);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    };
    canvas.onpointerup = () => { drawing = false; };
    canvas.onpointerleave = () => { drawing = false; };
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case "DRAFT": return l("ts.draft");
      case "WORKER_SIGNED": return l("ts.workerSignedShort");
      case "CUSTOMER_SIGNED": return l("ts.customerSignedShort");
      case "COMPLETED": return l("ts.completed");
      case "LOCKED": return l("ts.locked");
      default: return s;
    }
  };

  return (
    <SectionCard title={l("ts.title")} subtitle={l("ts.subtitle")}>
      <MessageBar error={tsError} success={tsSuccess} />

      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <SecondaryButton key={p.id} onClick={() => void generateTimesheet(p.id)}>
              {generating ? l("ts.generating") : `KW ${currentWeekNumber} · ${p.projectNumber}`}
            </SecondaryButton>
          ))}
        </div>

        {timesheets.length > 0 ? (
          <div className="grid gap-2">
            {timesheets.map((ts) => (
              <div key={ts.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">KW {ts.weekNumber} / {ts.weekYear} · {ts.project.projectNumber}</div>
                    <div className="text-xs text-slate-500">
                      {Math.floor(ts.totalMinutesNet / 60)}h {ts.totalMinutesNet % 60}m netto · {statusLabel(ts.status)}
                      {ts.signatures.length > 0 ? ` · ${ts.signatures.map((s) => `${s.signerType === "WORKER" ? "Monteur" : "Kunde"}: ${s.signerName}`).join(", ")}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void downloadPdf(ts.id)}
                      className="rounded-lg border border-black/10 px-2 py-1 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800">PDF</button>
                    <button type="button" onClick={() => { setEmailTsId(ts.id); setEmailRecipient(""); }}
                      className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400">E-Mail</button>
                    {ts.status === "DRAFT" ? (
                      <button type="button" onClick={() => setSigningTsId(ts.id)}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                        Unterschreiben
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{l("ts.noTimesheets")}</p>
        )}

        {signingTsId ? (
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <h4 className="mb-2 text-sm font-semibold">{l("ts.signatureTitle")}</h4>
            <canvas ref={initSignCanvas} width={400} height={150}
              className="w-full rounded-lg border border-black/10 bg-white" style={{ touchAction: "none" }} />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={signing} onClick={() => void signTimesheet()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                {signing ? l("ts.signing") : l("ts.confirm")}
              </button>
              <SecondaryButton onClick={() => setSigningTsId(null)}>{l("common.cancel")}</SecondaryButton>
            </div>
          </div>
        ) : null}

        {emailTsId ? (
          <div className="rounded-xl border-2 border-blue-300 bg-blue-50/50 p-4 dark:border-blue-500/30 dark:bg-blue-500/5">
            <h4 className="mb-2 text-sm font-semibold">{l("ts.emailTitle")}</h4>
            <div className="grid gap-3">
              <Field
                label={l("ts.recipientLabel")}
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" disabled={sending} onClick={() => void sendTimesheetEmail()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
                  {sending ? l("ts.sending") : l("ts.send")}
                </button>
                <SecondaryButton onClick={() => setEmailTsId(null)}>{l("common.cancel")}</SecondaryButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
