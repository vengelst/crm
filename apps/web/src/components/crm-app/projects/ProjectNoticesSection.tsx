"use client";
import { useI18n } from "../../../i18n-context";

import { useCallback, useEffect, useState } from "react";
import type { ProjectNotice } from "../types";
import { CollapsibleContent, CollapseIndicator, cx, SecondaryButton, Field, TextArea } from "../shared";

export function ProjectNoticesSection({ projectId, apiFetch, isAdmin, workerId }: {
  projectId: string;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  isAdmin: boolean;
  workerId?: string;
}) {
  const { locale, t: l } = useI18n();
  const [notices, setNotices] = useState<ProjectNotice[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [newRequireSig, setNewRequireSig] = useState(false);
  const [sigCanvasRef, setSignCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const [signingNoticeId, setSigningNoticeId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<ProjectNotice[]>(`/checklists/notices/project/${projectId}`).catch(() => []);
    setNotices(data);
  }, [apiFetch, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function addNotice() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setMsg(null);
    try {
      await apiFetch(`/checklists/notices/project/${projectId}`, {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim(), required: newRequired, requireSignature: newRequireSig }),
      });
      setNewTitle(""); setNewBody(""); setNewRequired(false); setNewRequireSig(false);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : l("common.error")); }
  }

  async function acknowledge(noticeId: string, signatureImagePath?: string) {
    setMsg(null);
    try {
      await apiFetch(`/checklists/notices/${noticeId}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ signatureImagePath }),
      });
      setSigningNoticeId(null);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : l("common.error")); }
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
      const rect = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
    };
    canvas.onpointermove = (e) => {
      if (!drawing) return;
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
      ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
    };
    canvas.onpointerup = () => { drawing = false; };
    canvas.onpointerleave = () => { drawing = false; };
  }

  async function removeNotice(id: string) {
    await apiFetch(`/checklists/notices/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  const myAck = (n: ProjectNotice) => workerId ? n.acknowledgements.find((a) => a.workerId === workerId) : undefined;

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/70 px-4 py-3 text-left transition hover:bg-emerald-100/70 dark:border-emerald-400/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
      >
        <h4 className="text-base font-semibold">{l("notice.siteNotices")}</h4>
        <CollapseIndicator open={expanded} />
      </button>
      <CollapsibleContent open={expanded}>
        <div>
          {msg ? <div className="mb-2 text-xs text-red-600">{msg}</div> : null}

          {notices.length === 0 ? (
            <p className="text-sm text-slate-500">{l("notice.noNotices")}</p>
          ) : (
            <div className="grid gap-4">
              {notices.map((n) => {
                const ack = myAck(n);
                return (
                  <div key={n.id} className={cx("rounded-xl border p-4", ack?.acknowledged ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-black/10 dark:border-white/10")}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{n.title}</span>
                        {n.required ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-400">{l("notice.required")}</span> : null}
                        {n.requireSignature ? <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">{l("notice.signature")}</span> : null}
                      </div>
                      {isAdmin ? <button type="button" onClick={() => void removeNotice(n.id)} className="text-xs text-red-500 hover:underline">{l("notice.deactivate")}</button> : null}
                    </div>
                    <div className="mb-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{n.body}</div>

                    {!isAdmin && workerId ? (
                      ack?.acknowledged ? (
                        <div className="text-xs text-emerald-600 dark:text-emerald-400">
                          {ack.signatureImagePath ? l("notice.signed") : l("notice.acknowledged")} am {ack.acknowledgedAt ? new Date(ack.acknowledgedAt).toLocaleString(locale) : ""}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {n.requireSignature ? (
                            signingNoticeId === n.id ? (
                              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/5">
                                <p className="mb-2 text-xs font-medium">{l("notice.signature")}</p>
                                <canvas ref={initSignCanvas} width={400} height={120} className="w-full rounded-lg border border-black/10 bg-white" style={{ touchAction: "none" }} />
                                <div className="mt-2 flex gap-2">
                                  <button type="button" onClick={() => { if (sigCanvasRef) void acknowledge(n.id, sigCanvasRef.toDataURL("image/png")); }}
                                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500">{l("notice.signature")}</button>
                                  <SecondaryButton onClick={() => setSigningNoticeId(null)}>{l("common.cancel")}</SecondaryButton>
                                </div>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setSigningNoticeId(n.id)}
                                className="w-fit rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500">
                                {l("notice.sign")}
                              </button>
                            )
                          ) : (
                            <button type="button" onClick={() => void acknowledge(n.id)}
                              className="w-fit rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500">
                              {l("notice.acknowledge")}
                            </button>
                          )}
                        </div>
                      )
                    ) : null}

                    {isAdmin && n.acknowledgements.length > 0 ? (
                      <div className="mt-3 border-t border-black/10 pt-2 dark:border-white/10">
                        <p className="mb-1 text-xs font-medium text-slate-500">{l("notice.confirmations")}</p>
                        <div className="grid gap-1">
                          {n.acknowledgements.map((a) => (
                            <div key={a.id} className="flex items-center gap-2 text-xs">
                              <span className={cx("h-2 w-2 rounded-full", a.acknowledged ? "bg-emerald-500" : "bg-slate-300")} />
                              <span className="font-medium">{a.worker?.firstName} {a.worker?.lastName}</span>
                              <span className="text-slate-400">({a.worker?.workerNumber})</span>
                              {a.acknowledged ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {a.signatureImagePath ? l("notice.signedOn") : l("notice.confirmedOn")} {a.acknowledgedAt ? `${new Date(a.acknowledgedAt).toLocaleDateString(locale)}` : ""}
                                </span>
                              ) : <span className="text-slate-400">{l("notice.open")}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {isAdmin ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
              <p className="text-sm font-medium">{l("notice.addNotice")}</p>
              <Field label={l("notice.title")} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <TextArea label={l("notice.text")} value={newBody} onChange={(e) => setNewBody(e.target.value)} />
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newRequired} onChange={() => setNewRequired(!newRequired)} /> {l("notice.required")}</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newRequireSig} onChange={() => setNewRequireSig(!newRequireSig)} /> {l("notice.signatureRequired")}</label>
              </div>
              <SecondaryButton onClick={() => void addNotice()}>{l("notice.addNotice")}</SecondaryButton>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </div>
  );
}

