"use client";

import { useEffect, useState } from "react";
import { t, type SupportedLang } from "../../../i18n";
import type { WorkerTimeStatus } from "../types";
import { SecondaryButton } from "../shared";

export function OpenWorkCard({ openWork, working, onClockOut, onOpenProject, lang = "de" as SupportedLang }: {
  openWork: NonNullable<WorkerTimeStatus["openEntry"]>;
  working: boolean;
  onClockOut: () => void;
  onOpenProject: () => void;
  lang?: SupportedLang;
}) {
  const l = (key: string) => t(key, lang);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(openWork.startedAt).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setElapsed(`${h}h ${String(m).padStart(2, "0")}m`);
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [openWork.startedAt]);

  const locale = lang === "en" ? "en-GB" : "de-DE";
  const mapsLink = openWork.latitude != null && openWork.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${openWork.latitude},${openWork.longitude}`
    : null;

  return (
    <div className="rounded-3xl border-2 border-emerald-400 bg-emerald-50/60 p-6 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/5">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{l("worker.currentWork")}</div>
      <div className="text-xl font-semibold">{openWork.projectTitle}</div>
      <p className="text-sm text-slate-500">{openWork.projectNumber}</p>
      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-slate-500">{l("worker.startedAt")}</span>{" "}
            <span className="font-mono">{new Date(openWork.startedAt).toLocaleString(locale)}</span>
          </div>
          <div className="rounded-lg bg-emerald-100 px-3 py-1 font-mono text-lg font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            {elapsed}
          </div>
        </div>
        {mapsLink ? (
          <div className="text-slate-500">
            {l("worker.startLocation")}{" "}
            <a href={mapsLink} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
              {openWork.latitude?.toFixed(5)}, {openWork.longitude?.toFixed(5)} ({l("worker.map")})
            </a>
          </div>
        ) : (
          <div className="text-slate-400">{l("worker.noLocation")}</div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={working} onClick={onClockOut}
          className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60">
          {working ? l("worker.stoppingWork") : l("worker.stopWork")}
        </button>
        <SecondaryButton onClick={onOpenProject}>{l("worker.openProject")}</SecondaryButton>
      </div>
    </div>
  );
}
