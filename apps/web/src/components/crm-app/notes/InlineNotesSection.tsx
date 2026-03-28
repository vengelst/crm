"use client";

import { useI18n } from "../../../i18n-context";
import { useCallback, useEffect, useState } from "react";
import type { NoteItem } from "../types";
import { SecondaryButton, TextArea, Field } from "../shared";
import { NoteDetailModal } from "./NoteDetailModal";
import { SpeechButton } from "./SpeechButton";
import { appendSpeechTranscript } from "./speech-format";

/**
 * Reusable inline notes section that can be embedded in any detail view.
 * Pre-scoped to a specific customer or contact — no entity selector needed.
 */
export function InlineNotesSection({
  entityType,
  customerId,
  contactId,
  apiFetch,
}: {
  entityType: "CUSTOMER" | "CONTACT";
  customerId: string;
  contactId?: string;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const { t: l, locale } = useI18n();
  const lang = locale.startsWith("en") ? "en" : "de";
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formIsPhone, setFormIsPhone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("entityType", entityType);
    if (entityType === "CONTACT" && contactId) {
      params.set("contactId", contactId);
    } else {
      params.set("customerId", customerId);
    }
    const data = await apiFetch<NoteItem[]>(`/notes?${params.toString()}`).catch(() => []);
    setNotes(data);
  }, [apiFetch, entityType, customerId, contactId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveNote() {
    if (!formContent.trim()) return;
    setMsg(null);
    try {
      await apiFetch("/notes", {
        method: "POST",
        body: JSON.stringify({
          entityType,
          customerId,
          contactId: entityType === "CONTACT" ? contactId : undefined,
          title: formTitle || undefined,
          content: formContent,
          isPhoneNote: formIsPhone,
        }),
      });
      setMsg(l("notes.saved"));
      setShowForm(false);
      setFormContent("");
      setFormTitle("");
      setFormIsPhone(false);
      await load();
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setMsg(e instanceof Error ? e.message : l("common.error")); }
  }

  function startPhoneNote() {
    setShowForm(true);
    setFormIsPhone(true);
  }

  async function updateNote(id: string, data: { title?: string; content: string; isPhoneNote?: boolean }) {
    await apiFetch(`/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    await load();
    const refreshed = await apiFetch<NoteItem>(`/notes/${id}`);
    setSelectedNote(refreshed);
  }

  async function deleteNote(id: string) {
    await apiFetch(`/notes/${id}`, { method: "DELETE" }).catch(() => {});
    setSelectedNote(null);
    await load();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-base font-semibold">{l("notes.title")}</h4>
        <div className="flex gap-2">
          <SecondaryButton onClick={startPhoneNote}>
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
              </svg>
              {l("notes.startPhoneNote")}
            </span>
          </SecondaryButton>
          <SecondaryButton onClick={() => setShowForm(!showForm)}>
            {showForm ? l("notes.cancel") : l("notes.new")}
          </SecondaryButton>
        </div>
      </div>

      {msg ? <div className="mb-2 text-xs text-emerald-600 dark:text-emerald-400">{msg}</div> : null}

      {showForm ? (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-500/30 dark:bg-blue-500/5">
          <div className="grid gap-2">
            <Field label={l("doc.title")} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            <TextArea label={l("notes.content")} value={formContent} onChange={(e) => setFormContent(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formIsPhone} onChange={(e) => setFormIsPhone(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600" />
                {l("notes.phoneNote")}
              </label>
              <SpeechButton lang={lang} l={l} onAppend={(text) => setFormContent((prev) => appendSpeechTranscript(prev, text, lang))} />
            </div>
            <SecondaryButton onClick={() => void saveNote()}>{l("notes.save")}</SecondaryButton>
          </div>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">{l("notes.none")}</p>
      ) : (
        <div className="grid gap-2">
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => setSelectedNote(note)}
              className="w-full rounded-xl border border-black/10 bg-white/60 p-3 text-left transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/60 dark:hover:bg-slate-800/60"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {note.title ? <div className="text-sm font-semibold">{note.title}</div> : null}
                  <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {note.content}
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-slate-400">
                    <span>{new Date(note.createdAt).toLocaleDateString(locale)}</span>
                    {note.createdBy ? <span>{note.createdBy.displayName}</span> : null}
                  </div>
                </div>
                {note.isPhoneNote ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                    {l("notes.phoneNote")}
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedNote ? (
        <NoteDetailModal
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onSave={updateNote}
          onDelete={deleteNote}
        />
      ) : null}
    </div>
  );
}
