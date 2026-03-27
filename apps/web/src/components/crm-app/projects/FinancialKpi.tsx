"use client";

import { cx } from "../shared";

export function FinancialKpi({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={cx(
      "rounded-xl border p-3",
      warn ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10" :
      highlight ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" :
      "border-black/10 bg-slate-50 dark:border-white/10 dark:bg-slate-950"
    )}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cx("text-lg font-semibold font-mono", warn ? "text-red-600 dark:text-red-400" : highlight ? "text-emerald-700 dark:text-emerald-300" : "")}>{value}</div>
    </div>
  );
}

