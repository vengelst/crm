"use client";

import { useI18n } from "../../../i18n-context";
import { useState } from "react";
import type { NoteItem } from "../types";
import { SecondaryButton, TextArea, Field, MessageBar } from "../shared";
import { SpeechButton } from "./SpeechButton";
import { appendSpeechTranscript } from "./speech-format";

export function NoteDetailModal({
  note,
  onClose,
  onSave,
  onDelete,
}: {
  note: NoteItem;
  onClose: () => void;
  onSave: (id: string, data: { title?: string; content: string; isPhoneNote?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t: l, locale } = useI18n();
  const lang = locale.startsWith("en") ? "en" : "de";
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title ?? "");
  const [editContent, setEditContent] = useState(note.content);
  const [editIsPhone, setEditIsPhone] = useState(note.isPhoneNote ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!editContent.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(note.id, {
        title: editTitle || undefined,
        content: editContent,
        isPhoneNote: editIsPhone,
      });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : l("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(l("common.confirm"))) return;
    await onDelete(note.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-2xl rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{l("notes.detail")}</h3>
            {note.isPhoneNote ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                {l("notes.phoneNote")}
              </span>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">&times;</button>
        </div>

        <div className="mb-4">
          <MessageBar error={error} success={null} />
        </div>

        {/* Metadata */}
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{new Date(note.createdAt).toLocaleString(locale)}</span>
          {note.createdBy ? <span>{l("notes.createdBy")}: {note.createdBy.displayName}</span> : null}
          {note.customer ? (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
              {l("notes.customer")}: {note.customer.companyName}
            </span>
          ) : null}
          {note.contact ? (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
              {l("notes.contact")}: {note.contact.firstName} {note.contact.lastName}
            </span>
          ) : null}
        </div>

        {editing ? (
          <div className="grid gap-3">
            <Field label={l("doc.title")} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <TextArea label={l("notes.content")} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editIsPhone} onChange={(e) => setEditIsPhone(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600" />
                {l("notes.phoneNote")}
              </label>
              <SpeechButton lang={lang} l={l} onAppend={(text) => setEditContent((prev) => appendSpeechTranscript(prev, text, lang))} />
            </div>
            <div className="flex gap-2">
              <SecondaryButton onClick={() => void handleSave()}>
                {saving ? "..." : l("notes.save")}
              </SecondaryButton>
              <SecondaryButton onClick={() => setEditing(false)}>{l("notes.cancel")}</SecondaryButton>
            </div>
          </div>
        ) : (
          <div>
            {note.title ? <h4 className="mb-2 text-base font-semibold">{editing ? editTitle : note.title}</h4> : null}
            <div className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">
              {note.content}
            </div>
            <div className="mt-4 flex gap-2">
              <SecondaryButton onClick={() => setEditing(true)}>{l("notes.edit")}</SecondaryButton>
              <button type="button" onClick={() => void handleDelete()} className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-500/10">
                {l("notes.delete")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
