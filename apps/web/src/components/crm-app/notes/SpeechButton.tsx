"use client";

import { useSpeechInput } from "./useSpeechInput";

/**
 * Microphone / dictation button for note text areas.
 * Appends recognized speech to the current text via onAppend callback.
 */
export function SpeechButton({
  lang,
  onAppend,
  l,
}: {
  lang: string;
  onAppend: (text: string) => void;
  l: (key: string) => string;
}) {
  const { status, supported, start, stop } = useSpeechInput(lang);

  if (!supported) {
    return (
      <span className="text-xs text-slate-400 italic">{l("notes.speechUnavailable")}</span>
    );
  }

  const recording = status === "recording";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (recording) {
            stop();
          } else {
            start((text) => onAppend(text));
          }
        }}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
          recording
            ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
            : "border-black/10 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
        }`}
      >
        {recording ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            {l("notes.speechStop")}
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M7 4a3 3 0 016 0v6a3 3 0 01-6 0V4z" />
              <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
            </svg>
            {l("notes.speechStart")}
          </>
        )}
      </button>
      {status === "denied" && <span className="text-xs text-red-500">{l("notes.speechDenied")}</span>}
      {status === "error" && <span className="text-xs text-red-500">{l("notes.speechError")}</span>}
      {recording && <span className="text-xs text-red-500 animate-pulse">{l("notes.speechRecording")}</span>}
    </div>
  );
}
