"use client";
import { useI18n } from "../../../i18n-context";

import { useCallback, useEffect, useState } from "react";
import type { Checklist, ChecklistTemplate } from "../types";
import { CollapsibleContent, CollapseIndicator, cx, SecondaryButton } from "../shared";

export function ProjectChecklistSection({ projectId, apiFetch, isAdmin }: {
  projectId: string;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  isAdmin: boolean;
}) {
  const { t: l, locale } = useI18n();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [newChecklistName, setNewChecklistName] = useState("");
  const [newItemTitle, setNewItemTitle] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [editingCl, setEditingCl] = useState<string | null>(null);
  const [editClForm, setEditClForm] = useState({ name: "", description: "" });
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemForm, setEditItemForm] = useState({ title: "", description: "", sortOrder: 0 });
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<Checklist[]>(`/checklists/project/${projectId}`).catch(() => []);
    setChecklists(data);
  }, [apiFetch, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      const timer = window.setTimeout(() => {
        void apiFetch<ChecklistTemplate[]>("/checklists/templates").then(setTemplates).catch(() => {});
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [apiFetch, isAdmin]);

  async function addChecklist() {
    if (!newChecklistName.trim()) return;
    setMsg(null);
    try {
      await apiFetch(`/checklists/project/${projectId}`, { method: "POST", body: JSON.stringify({ name: newChecklistName.trim() }) });
      setNewChecklistName("");
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : l("common.error")); }
  }

  async function removeChecklist(id: string) {
    if (!window.confirm(l("checklist.deleteChecklist"))) return;
    await apiFetch(`/checklists/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  async function addItem(checklistId: string) {
    const title = (newItemTitle[checklistId] ?? "").trim();
    if (!title) return;
    await apiFetch(`/checklists/${checklistId}/items`, { method: "POST", body: JSON.stringify({ title }) }).catch(() => {});
    setNewItemTitle((c) => ({ ...c, [checklistId]: "" }));
    await load();
  }

  async function removeItem(id: string) {
    await apiFetch(`/checklists/items/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  async function toggleItem(id: string, completed: boolean, comment?: string) {
    await apiFetch(`/checklists/items/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ completed, comment }),
    }).catch(() => {});
    await load();
  }

  async function saveChecklist(id: string) {
    await apiFetch(`/checklists/${id}`, { method: "PATCH", body: JSON.stringify(editClForm) }).catch((e) => setMsg(e instanceof Error ? e.message : l("common.error")));
    setEditingCl(null);
    await load();
  }

  async function saveItem(id: string) {
    await apiFetch(`/checklists/items/${id}`, { method: "PATCH", body: JSON.stringify(editItemForm) }).catch((e) => setMsg(e instanceof Error ? e.message : l("common.error")));
    setEditingItem(null);
    await load();
  }

  async function applyTemplate(templateId: string) {
    await apiFetch(`/checklists/templates/${templateId}/apply/${projectId}`, { method: "POST" }).catch(() => {});
    await load();
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/70 px-4 py-3 text-left transition hover:bg-emerald-100/70 dark:border-emerald-400/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
      >
        <h4 className="text-base font-semibold">{l("checklist.title")}</h4>
        <CollapseIndicator open={expanded} />
      </button>
      <CollapsibleContent open={expanded}>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div />
            {isAdmin && templates.length > 0 ? (
              <select onChange={(e) => { if (e.target.value) void applyTemplate(e.target.value); e.target.value = ""; }}
                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-900">
                <option value="">{l("checklist.applyTemplate")}</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : null}
          </div>
          {msg ? <div className="mb-2 text-xs text-red-600">{msg}</div> : null}

          {checklists.length === 0 ? (
            <p className="text-sm text-slate-500">{l("checklist.noChecklists")}</p>
          ) : (
            <div className="grid gap-4">
              {checklists.map((cl) => (
                <div key={cl.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                  <div className="mb-2 flex items-center justify-between">
                    {editingCl === cl.id ? (
                      <div className="flex flex-1 gap-2">
                        <input type="text" value={editClForm.name} onChange={(e) => setEditClForm((c) => ({ ...c, name: e.target.value }))}
                          className="flex-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-slate-900" />
                        <button type="button" onClick={() => void saveChecklist(cl.id)} className="text-xs text-emerald-600 hover:underline">{l("common.save")}</button>
                        <button type="button" onClick={() => setEditingCl(null)} className="text-xs text-slate-400 hover:underline">{l("common.cancel")}</button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-semibold">{cl.name}</span>
                        {isAdmin ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setEditingCl(cl.id); setEditClForm({ name: cl.name, description: cl.description ?? "" }); }} className="text-xs text-blue-500 hover:underline">{l("common.edit")}</button>
                            <button type="button" onClick={() => void removeChecklist(cl.id)} className="text-xs text-red-500 hover:underline">{l("common.delete")}</button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  {editingCl === cl.id ? (
                    <input type="text" placeholder={l("checklist.description")} value={editClForm.description} onChange={(e) => setEditClForm((c) => ({ ...c, description: e.target.value }))}
                      className="mb-2 w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-900" />
                  ) : cl.description ? <p className="mb-2 text-xs text-slate-500">{cl.description}</p> : null}
                  <div className="grid gap-1.5">
                    {cl.items.map((item) => (
                      <div key={item.id} className={cx("flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm", item.completed ? "bg-emerald-50 dark:bg-emerald-500/5" : "")}>
                        <input type="checkbox" checked={item.completed}
                          disabled={!isAdmin && item.completed}
                          onChange={() => {
                            if (!item.completed) {
                              const comment = window.prompt(l("checklist.optionalComment"));
                              void toggleItem(item.id, true, comment ?? undefined);
                            } else if (isAdmin) {
                              void toggleItem(item.id, false);
                            }
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded disabled:opacity-50"
                        />
                        <div className="min-w-0 flex-1">
                          {editingItem === item.id ? (
                            <div className="grid gap-1">
                              <textarea value={editItemForm.title} onChange={(e) => setEditItemForm((c) => ({ ...c, title: e.target.value }))}
                                rows={3}
                                className="rounded border border-black/10 px-2 py-1 text-sm dark:border-white/10 dark:bg-slate-900" />
                              <input type="text" placeholder={l("checklist.description")} value={editItemForm.description} onChange={(e) => setEditItemForm((c) => ({ ...c, description: e.target.value }))}
                                className="rounded border border-black/10 px-2 py-0.5 text-xs dark:border-white/10 dark:bg-slate-900" />
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-slate-500">{l("checklist.sortOrder")}</label>
                                <input type="number" value={editItemForm.sortOrder} onChange={(e) => setEditItemForm((c) => ({ ...c, sortOrder: Number(e.target.value) }))}
                                  className="w-16 rounded border border-black/10 px-1 py-0.5 text-xs dark:border-white/10 dark:bg-slate-900" />
                                <button type="button" onClick={() => void saveItem(item.id)} className="text-xs text-emerald-600 hover:underline">{l("common.ok")}</button>
                                <button type="button" onClick={() => setEditingItem(null)} className="text-xs text-slate-400 hover:underline">{l("common.cancel")}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={cx("whitespace-pre-wrap", item.completed ? "line-through text-slate-400" : "")}>{item.title}</div>
                              {item.description ? <div className="text-xs text-slate-400">{item.description}</div> : null}
                              {item.completed && item.completedByName ? (
                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                  {l("checklist.completedBy")} {item.completedByName}{item.completedAt ? ` am ${new Date(item.completedAt).toLocaleString(locale)}` : ""}
                                  {item.comment ? ` — ${item.comment}` : ""}
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                        {isAdmin && editingItem !== item.id ? (
                          <div className="flex shrink-0 gap-1">
                            <button type="button" onClick={() => { setEditingItem(item.id); setEditItemForm({ title: item.title, description: item.description ?? "", sortOrder: item.sortOrder }); }} className="text-xs text-blue-400 hover:text-blue-600">{l("common.edit")}</button>
                            <button type="button" onClick={() => void removeItem(item.id)} className="text-xs text-red-400 hover:text-red-600">x</button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {isAdmin ? (
                    <div className="mt-2 flex gap-2">
                      <textarea placeholder={l("checklist.newItem")} value={newItemTitle[cl.id] ?? ""}
                        rows={3}
                        onChange={(e) => setNewItemTitle((c) => ({ ...c, [cl.id]: e.target.value }))}
                        className="flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-900"
                      />
                      <SecondaryButton onClick={() => void addItem(cl.id)}>{l("checklist.addItem")}</SecondaryButton>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {isAdmin ? (
            <div className="mt-3 flex gap-2">
              <input type="text" placeholder={l("checklist.newChecklist")} value={newChecklistName}
                onChange={(e) => setNewChecklistName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addChecklist(); }}
                className="flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-900"
              />
              <SecondaryButton onClick={() => void addChecklist()}>{l("checklist.createChecklist")}</SecondaryButton>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </div>
  );
}

