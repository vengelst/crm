"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { useI18n } from "../../../i18n-context";
import type { ChecklistTemplate } from "../types";
import { SectionCard, SecondaryButton } from "../shared";

export function ChecklistTemplateSettings({ apiFetch, setPanelSuccess, setPanelError }: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  setPanelSuccess: Dispatch<SetStateAction<string | null>>;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const { t: l } = useI18n();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [newName, setNewName] = useState("");
  const [newItemTitle, setNewItemTitle] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editTpl, setEditTpl] = useState<string | null>(null);
  const [editTplForm, setEditTplForm] = useState({ name: "", description: "" });
  const [editTplItem, setEditTplItem] = useState<string | null>(null);
  const [editTplItemForm, setEditTplItemForm] = useState({ title: "", description: "", sortOrder: 0 });

  const load = useCallback(async () => {
    const data = await apiFetch<ChecklistTemplate[]>("/checklists/templates").catch(() => []);
    setTemplates(data);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createTemplate() {
    if (!newName.trim()) return;
    setPanelError(null);
    try {
      await apiFetch("/checklists/templates", { method: "POST", body: JSON.stringify({ name: newName.trim() }) });
      setNewName("");
      setPanelSuccess(l("settings.templateCreated"));
      await load();
    } catch (e) { setPanelError(e instanceof Error ? e.message : l("common.error")); }
  }

  async function saveTpl(id: string) {
    await apiFetch(`/checklists/templates/${id}`, { method: "PATCH", body: JSON.stringify(editTplForm) }).catch(() => {});
    setEditTpl(null);
    setPanelSuccess(l("settings.templateUpdated"));
    await load();
  }

  async function saveTplItem(id: string) {
    await apiFetch(`/checklists/templates/items/${id}`, { method: "PATCH", body: JSON.stringify(editTplItemForm) }).catch(() => {});
    setEditTplItem(null);
    await load();
  }

  async function removeTemplate(id: string) {
    if (!window.confirm(l("settings.deleteTemplate"))) return;
    await apiFetch(`/checklists/templates/${id}`, { method: "DELETE" }).catch(() => {});
    setPanelSuccess(l("settings.templateDeleted"));
    await load();
  }

  async function addItem(templateId: string) {
    const title = (newItemTitle[templateId] ?? "").trim();
    if (!title) return;
    await apiFetch(`/checklists/templates/${templateId}/items`, { method: "POST", body: JSON.stringify({ title }) }).catch(() => {});
    setNewItemTitle((c) => ({ ...c, [templateId]: "" }));
    await load();
  }

  async function removeItem(id: string) {
    await apiFetch(`/checklists/templates/items/${id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  if (loading) return <SectionCard title={l("settings.templates")}><p className="text-sm text-slate-500">{l("common.loading")}</p></SectionCard>;

  return (
    <div className="grid gap-6">
      <SectionCard title={l("settings.templates")} subtitle={l("settings.templatesSub")}>
        {templates.length === 0 ? (
          <p className="text-sm text-slate-500">{l("settings.noTemplates")}</p>
        ) : (
          <div className="grid gap-4">
            {templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="mb-2 flex items-center justify-between">
                  {editTpl === t.id ? (
                    <div className="flex flex-1 gap-2">
                      <input type="text" value={editTplForm.name} onChange={(e) => setEditTplForm((c) => ({ ...c, name: e.target.value }))}
                        className="flex-1 rounded border border-black/10 px-2 py-0.5 text-sm dark:border-white/10 dark:bg-slate-900" />
                      <input type="text" placeholder={l("checklist.description")} value={editTplForm.description} onChange={(e) => setEditTplForm((c) => ({ ...c, description: e.target.value }))}
                        className="flex-1 rounded border border-black/10 px-2 py-0.5 text-xs dark:border-white/10 dark:bg-slate-900" />
                      <button type="button" onClick={() => void saveTpl(t.id)} className="text-xs text-emerald-600 hover:underline">{l("common.ok")}</button>
                      <button type="button" onClick={() => setEditTpl(null)} className="text-xs text-slate-400 hover:underline">{l("common.cancel")}</button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="font-semibold">{t.name}</span>
                        {t.description ? <span className="ml-2 text-xs text-slate-500">{t.description}</span> : null}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setEditTpl(t.id); setEditTplForm({ name: t.name, description: t.description ?? "" }); }} className="text-xs text-blue-500 hover:underline">{l("common.edit")}</button>
                        <button type="button" onClick={() => void removeTemplate(t.id)} className="text-xs text-red-500 hover:underline">{l("common.delete")}</button>
                      </div>
                    </>
                  )}
                </div>
                <div className="grid gap-1">
                  {t.items.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-sm dark:bg-slate-800">
                      {editTplItem === item.id ? (
                        <div className="flex flex-1 gap-2">
                          <input type="text" value={editTplItemForm.title} onChange={(e) => setEditTplItemForm((c) => ({ ...c, title: e.target.value }))}
                            className="flex-1 rounded border border-black/10 px-1 py-0.5 text-sm dark:border-white/10 dark:bg-slate-900" />
                          <input type="number" value={editTplItemForm.sortOrder} onChange={(e) => setEditTplItemForm((c) => ({ ...c, sortOrder: Number(e.target.value) }))}
                            className="w-12 rounded border border-black/10 px-1 py-0.5 text-xs dark:border-white/10 dark:bg-slate-900" />
                          <button type="button" onClick={() => void saveTplItem(item.id)} className="text-xs text-emerald-600">{l("common.ok")}</button>
                          <button type="button" onClick={() => setEditTplItem(null)} className="text-xs text-slate-400">X</button>
                        </div>
                      ) : (
                        <>
                          <span>{idx + 1}. {item.title}</span>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => { setEditTplItem(item.id); setEditTplItemForm({ title: item.title, description: item.description ?? "", sortOrder: item.sortOrder }); }} className="text-xs text-blue-400">{l("common.edit")}</button>
                            <button type="button" onClick={() => void removeItem(item.id)} className="text-xs text-red-400 hover:text-red-600">x</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input type="text" placeholder="Neuer Punkt..." value={newItemTitle[t.id] ?? ""}
                    onChange={(e) => setNewItemTitle((c) => ({ ...c, [t.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") void addItem(t.id); }}
                    className="flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-900"
                  />
                  <SecondaryButton onClick={() => void addItem(t.id)}>{l("checklist.addItem")}</SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <input type="text" placeholder={l("settings.newTemplate")} value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createTemplate(); }}
            className="flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-slate-900"
          />
          <SecondaryButton onClick={() => void createTemplate()}>{l("settings.createTemplate")}</SecondaryButton>
        </div>
      </SectionCard>
    </div>
  );
}

