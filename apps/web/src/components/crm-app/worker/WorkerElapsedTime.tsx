"use client";

import { useEffect, useState } from "react";
import { t, type SupportedLang } from "../../../i18n";

export function WorkerElapsedTime({ startedAt, lang = "de" as SupportedLang }: { startedAt: string; lang?: SupportedLang }) {
  const l = (key: string) => t(key, lang);
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(startedAt).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setElapsed(`${h}h ${String(m).padStart(2, "0")}m`);
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const locale = lang === "en" ? "en-GB" : "de-DE";

  return (
    <div className="mt-1 text-sm">
      {l("worker.startedAt")} <span className="font-mono">{new Date(startedAt).toLocaleString(locale)}</span>
      {" "}<span className="rounded-lg bg-emerald-100 px-2 py-0.5 font-mono font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">{elapsed}</span>
    </div>
  );
}
