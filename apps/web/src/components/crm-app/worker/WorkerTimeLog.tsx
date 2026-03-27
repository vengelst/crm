"use client";

import { useState } from "react";
import type { Worker } from "../types";
import { cx, SecondaryButton, PrintButton, openPrintWindow } from "../shared";

export function WorkerTimeLog({ entries, workerName }: { entries: NonNullable<Worker["timeEntries"]>; workerName?: string }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

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
    if (!end) return "laufend";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
        <h4 className="text-base font-semibold">Arbeitsprotokoll</h4>
        <p className="mt-2 text-sm text-slate-500">Keine Zeitbuchungen vorhanden.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-800/40">
      <h4 className="mb-3 text-base font-semibold">Arbeitsprotokoll</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
              <th className="pb-2 pr-2">Datum</th>
              <th className="pb-2 pr-2">Projekt</th>
              <th className="pb-2 pr-2">Anmeldung</th>
              <th className="pb-2 pr-2">Ort</th>
              <th className="pb-2 pr-2">Abmeldung</th>
              <th className="pb-2 pr-2">Ort</th>
              <th className="pb-2 pr-2">Dauer</th>
              <th className="pb-2">Quelle</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => {
              const isOpen = !p.clockOut;
              return (
                <tr key={i} onClick={() => setSelectedIdx(i)} className={cx("cursor-pointer border-b border-black/5 transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800", isOpen && "bg-emerald-50/50 dark:bg-emerald-500/5")}>
                  <td className="py-2 pr-2 font-mono text-xs">{new Date(p.clockIn.occurredAtClient).toLocaleDateString("de-DE")}</td>
                  <td className="py-2 pr-2 text-xs">{p.clockIn.project?.projectNumber ?? "-"}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{new Date(p.clockIn.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2 pr-2 text-xs">{renderCoordinateLink(p.clockIn.latitude, p.clockIn.longitude)}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{p.clockOut ? new Date(p.clockOut.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : <span className="font-semibold text-emerald-600 dark:text-emerald-400">laufend</span>}</td>
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
        const dateStr = new Date(sp.clockIn.occurredAtClient).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
        const inTime = new Date(sp.clockIn.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const outTime = sp.clockOut ? new Date(sp.clockOut.occurredAtClient).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "laufend";
        const dur = duration(sp.clockIn.occurredAtClient, sp.clockOut?.occurredAtClient ?? null);
        const inUrl = mapsUrl(sp.clockIn.latitude, sp.clockIn.longitude);
        const outUrl = sp.clockOut ? mapsUrl(sp.clockOut.latitude, sp.clockOut.longitude) : null;

        function printDay() {
          openPrintWindow(`Tagesbericht ${dateStr}`, `
            <h1>Tagesbericht</h1>
            ${workerName ? `<p class="meta">${workerName}</p>` : ""}
            <h2>${dateStr}</h2>
            <div class="grid">
              <span class="label">Projekt</span><span>${sp.clockIn.project?.projectNumber ?? "-"}</span>
              <span class="label">Beginn</span><span>${inTime}</span>
              <span class="label">Ende</span><span>${outTime}</span>
              <span class="label">Dauer</span><span>${dur}</span>
              <span class="label">Standort Beginn</span><span>${sp.clockIn.latitude != null ? `${sp.clockIn.latitude.toFixed(5)}, ${sp.clockIn.longitude?.toFixed(5)}` : "-"}</span>
              <span class="label">Standort Ende</span><span>${sp.clockOut?.latitude != null ? `${sp.clockOut.latitude.toFixed(5)}, ${sp.clockOut.longitude?.toFixed(5)}` : "-"}</span>
              <span class="label">Quelle</span><span>${sp.clockIn.locationSource ?? "-"}</span>
            </div>
          `);
        }

        return (
          <div className="mt-3 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-lg dark:border-slate-600 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold">{dateStr}</h4>
              <div className="flex gap-2">
                <PrintButton onClick={printDay} label="Drucken" />
                <SecondaryButton onClick={() => setSelectedIdx(null)}>Schliessen</SecondaryButton>
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-slate-500">Projekt</span><span>{sp.clockIn.project?.projectNumber ?? "-"} {sp.clockIn.project?.title ?? ""}</span>
              <span className="text-slate-500">Beginn</span><span className="font-mono">{inTime}</span>
              <span className="text-slate-500">Ende</span><span className="font-mono">{outTime}</span>
              <span className="text-slate-500">Dauer</span><span className="font-mono font-semibold">{dur}</span>
              <span className="text-slate-500">Standort Beginn</span>
              <span>{inUrl ? <a href={inUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{sp.clockIn.latitude?.toFixed(5)}, {sp.clockIn.longitude?.toFixed(5)}</a> : "Kein Standort"}</span>
              <span className="text-slate-500">Standort Ende</span>
              <span>{outUrl ? <a href={outUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{sp.clockOut?.latitude?.toFixed(5)}, {sp.clockOut?.longitude?.toFixed(5)}</a> : "Kein Standort"}</span>
              <span className="text-slate-500">Quelle</span><span>{sp.clockIn.locationSource ?? "-"}</span>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}

