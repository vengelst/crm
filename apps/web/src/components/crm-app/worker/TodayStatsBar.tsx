"use client";

import { useEffect, useState } from "react";
import { t, type SupportedLang } from "../../../i18n";
import { formatMinutes } from "./format-minutes";

export function TodayStatsBar({ stats, lang = "de" as SupportedLang }: { stats: { completedMinutes: number; openSinceMinutes: number; totalMinutes: number }; lang?: SupportedLang }) {
  const l = (key: string) => t(key, lang);
  const [liveTotal, setLiveTotal] = useState(stats.totalMinutes);

  useEffect(() => {
    setLiveTotal(stats.totalMinutes);
    if (stats.openSinceMinutes > 0) {
      const interval = setInterval(() => {
        setLiveTotal((prev) => prev + 0.5);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [stats.totalMinutes, stats.openSinceMinutes]);

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-black/10 bg-white/80 px-5 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      <div className="text-sm text-slate-500">{l("worker.todayWorked")}</div>
      <div className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-lg font-semibold dark:bg-slate-800">
        {formatMinutes(Math.round(liveTotal))}
      </div>
      {stats.completedMinutes > 0 && stats.openSinceMinutes > 0 ? (
        <div className="text-xs text-slate-400">
          ({formatMinutes(stats.completedMinutes)} {l("worker.completed")} + {l("worker.running")})
        </div>
      ) : null}
    </div>
  );
}
