"use client";
import { useI18n } from "../../../i18n-context";

import { useState } from "react";
import type { Worker } from "../types";
import { cx, SecondaryButton, PrintButton, openPrintWindow } from "../shared";

export function WorkerTimeLog({ entries, workerName }: { entries: NonNullable<Worker["timeEntries"]>; workerName?: string }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const { locale, t: l } = useI18n();

  // Paare CLOCK_IN/CLOCK_OUT
  type WorkPair = {
    clockIn: (typeof entries)[number];
    clockOut: (typeof entries)[number] | null;
  };

  const sorted = [...entries].sort(
    (a, b) => new Date(a.occurredAtClient).getTime() - new Date(b.occurredAtClient).getTime(),
  );

  const pairs: WorkPair[] = [];
  let pendingIn: (typeof entries)[number] | null = null;

  for (const entry of sorted) {
    if (entry.entryType === "CLOCK_IN") {
      if (pendingIn) pairs.push({ clockIn: pendingIn, clockOut: null });
      pendingIn = entry;
    } else if (entry.entryType === "CLOCK_OUT" && pendingIn) {
      pairs.push({ clockIn: pendingIn, clockOut: entry });
      pendingIn = null;
    }
  }
  if (pendingIn) pairs.push({ clockIn: pendingIn, clockOut: null });

  pairs.reverse();

  function mapsUrl(lat?: number | null, lon?: number | null) {
    if (lat == null || lon == null) return null;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }

  function renderCoordinateLink(lat?: number | null, lon?: number | null) {
    const href = mapsUrl(lat, lon);
    if (!href || lat == null || lon == null) {
      return <span className="text-slate-400">-</span>;
    }
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px]">{lat.toFixed(5)}, {lon.toFixed(5)}</span>
        <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
          Map
        </a>
      </div>
    );
  }

  function duration(start: string, end: string | null) {
    if (!end) return l("timeLog.running");
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="text-base font-semibold">{l("timeLog.title")}</h4>
        <p className="mt-2 text-sm text-slate-500">{l("timeLog.noEntries")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <h4 className="mb-3 text-base font-semibold">{l("timeLog.title")}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
              <th className="pb-2 pr-2">{l("timeLog.date")}</th>
              <th className="pb-2 pr-2">{l("timeLog.project")}</th>
              <th className="pb-2 pr-2">{l("timeLog.clockIn")}</th>
              <th className="pb-2 pr-2">{l("timeLog.location")}</th>
              <th className="pb-2 pr-2">{l("timeLog.clockOut")}</th>
              <th className="pb-2 pr-2">{l("timeLog.location")}</th>
              <th className="pb-2 pr-2">{l("timeLog.duration")}</th>
              <th className="pb-2">{l("timeLog.source")}</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => {
              const isOpen = !p.clockOut;
              return (
                <tr key={i} onClick={() => setSelectedIdx(i)} className={cx("cursor-pointer border-b border-black/5 transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800", isOpen && "bg-emerald-50/50 dark:bg-emerald-500/5")}>
                  <td className="py-2 pr-2 font-mono text-xs">{new Date(p.clockIn.occurredAtClient).toLocaleDateString(locale)}</td>
                  <td className="py-2 pr-2 text-xs">{p.clockIn.project?.projectNumber ?? "-"}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{new Date(p.clockIn.occurredAtClient).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2 pr-2 text-xs">{renderCoordinateLink(p.clockIn.latitude, p.clockIn.longitude)}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{p.clockOut ? new Date(p.clockOut.occurredAtClient).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : <span className="font-semibold text-emerald-600 dark:text-emerald-400">{l("timeLog.running")}</span>}</td>
                  <td className="py-2 pr-2 text-xs">{renderCoordinateLink(p.clockOut?.latitude, p.clockOut?.longitude)}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{duration(p.clockIn.occurredAtClient, p.clockOut?.occurredAtClient ?? null)}</td>
                  <td className="py-2 text-xs text-slate-400">{p.clockIn.locationSource ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail-Popup */}
      {selectedIdx !== null && pairs[selectedIdx] ? (() => {
        const sp = pairs[selectedIdx];
        const dateStr = new Date(sp.clockIn.occurredAtClient).toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
        const inTime = new Date(sp.clockIn.occurredAtClient).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
        const outTime = sp.clockOut ? new Date(sp.clockOut.occurredAtClient).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : l("timeLog.running");
        const dur = duration(sp.clockIn.occurredAtClient, sp.clockOut?.occurredAtClient ?? null);
        const inUrl = mapsUrl(sp.clockIn.latitude, sp.clockIn.longitude);
        const outUrl = sp.clockOut ? mapsUrl(sp.clockOut.latitude, sp.clockOut.longitude) : null;

        function printDay() {
          openPrintWindow(`${l("print.dayReport")} ${dateStr}`, `
            <h1>${l("print.dayReport")}</h1>
            ${workerName ? `<p class="meta">${workerName}</p>` : ""}
            <h2>${dateStr}</h2>
            <div class="grid">
              <span class="label">${l("print.project")}</span><span>${sp.clockIn.project?.projectNumber ?? "-"}</span>
              <span class="label">${l("print.start")}</span><span>${inTime}</span>
              <span class="label">${l("print.end")}</span><span>${outTime}</span>
              <span class="label">${l("print.duration")}</span><span>${dur}</span>
              <span class="label">${l("print.startLocation")}</span><span>${sp.clockIn.latitude != null ? `${sp.clockIn.latitude.toFixed(5)}, ${sp.clockIn.longitude?.toFixed(5)}` : "-"}</span>
              <span class="label">${l("print.endLocation")}</span><span>${sp.clockOut?.latitude != null ? `${sp.clockOut.latitude.toFixed(5)}, ${sp.clockOut.longitude?.toFixed(5)}` : "-"}</span>
              <span class="label">${l("print.source")}</span><span>${sp.clockIn.locationSource ?? "-"}</span>
            </div>
          `);
        }

        return (
          <div className="mt-3 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-lg dark:border-slate-600 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold">{dateStr}</h4>
              <div className="flex gap-2">
                <PrintButton onClick={printDay} label={l("common.print")} />
                <SecondaryButton onClick={() => setSelectedIdx(null)}>{l("common.close")}</SecondaryButton>
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-slate-500">{l("timeLog.project")}</span><span>{sp.clockIn.project?.projectNumber ?? "-"} {sp.clockIn.project?.title ?? ""}</span>
              <span className="text-slate-500">{l("timeLog.start")}</span><span className="font-mono">{inTime}</span>
              <span className="text-slate-500">{l("timeLog.end")}</span><span className="font-mono">{outTime}</span>
              <span className="text-slate-500">{l("timeLog.duration")}</span><span className="font-mono font-semibold">{dur}</span>
              <span className="text-slate-500">{l("timeLog.startLocation")}</span>
              <span>{inUrl ? <a href={inUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{sp.clockIn.latitude?.toFixed(5)}, {sp.clockIn.longitude?.toFixed(5)}</a> : l("timeLog.noLocation")}</span>
              <span className="text-slate-500">{l("timeLog.endLocation")}</span>
              <span>{outUrl ? <a href={outUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{sp.clockOut?.latitude?.toFixed(5)}, {sp.clockOut?.longitude?.toFixed(5)}</a> : l("timeLog.noLocation")}</span>
              <span className="text-slate-500">{l("timeLog.source")}</span><span>{sp.clockIn.locationSource ?? "-"}</span>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}

