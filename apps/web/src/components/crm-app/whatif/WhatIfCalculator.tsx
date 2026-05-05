"use client";

import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n-context";
import {
  Field,
  FormRow,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  cx,
} from "../shared";
import {
  DEFAULT_PLANNING_INPUTS,
  type PeriodKey,
  type PeriodResult,
  type PlanningInputs,
  calculatePlanning,
} from "../projects/planning-calc";

/**
 * Was-waere-wenn-Kalkulator V2.
 *
 * Drei voreingestellte Szenarien (Konservativ / Realistisch / Aggressiv)
 * werden nebeneinander editierbar dargestellt. Vergleich + Delta gegen eine
 * waehlbare Referenz (gespeicherte Baseline ODER das Realistic-Slot).
 *
 * Persistenz: nur localStorage, eine Baseline (Backwards-compat zur V1) und
 * eine Liste benannter Custom-Presets, die alle drei Slots gemeinsam
 * sichern. Keine Server-Calls.
 *
 * Rechenkern: `calculatePlanning` aus dem Hauptmodul — gleiche Formeln wie
 * der Editor.
 */

const BASELINE_STORAGE_KEY = "crm.whatif.baseline.v1";
const CUSTOM_PRESETS_STORAGE_KEY = "crm.whatif.customPresets.v1";

const PERIOD_KEYS: PeriodKey[] = [
  "weekly",
  "monthly",
  "quarterly",
  "halfYear",
];

const SLOT_KEYS = ["conservative", "realistic", "aggressive"] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

/**
 * Kanonische Startwerte je Slot. Die Werte sind so gewaehlt, dass die drei
 * Profile in den KPIs sichtbar auseinanderdriften — sonst sehen Anwender
 * die Vergleichsmechanik nicht.
 */
const PRESET_PRESETS: Record<SlotKey, PlanningInputs> = {
  conservative: {
    teamsPerWeek: 3,
    workersPerTeam: 2,
    regularHoursPerWorkerWeek: 40,
    overtimeHoursPerWorkerWeek: 2,
    regularRatePerHour: 55,
    overtimeRatePerHour: 70,
    costPerWorkerWeek: 1400,
    weeksPerMonth: 4.33,
  },
  realistic: { ...DEFAULT_PLANNING_INPUTS },
  aggressive: {
    teamsPerWeek: 6,
    workersPerTeam: 2,
    regularHoursPerWorkerWeek: 42,
    overtimeHoursPerWorkerWeek: 8,
    regularRatePerHour: 75,
    overtimeRatePerHour: 95,
    costPerWorkerWeek: 1600,
    weeksPerMonth: 4.33,
  },
};

type DraftState = {
  // Strings — Eingabefelder tolerieren Komma/Punkt/Leerstring beim Tippen.
  teamsPerWeek: string;
  workersPerTeam: string;
  regularHoursPerWorkerWeek: string;
  overtimeHoursPerWorkerWeek: string;
  regularRatePerHour: string;
  overtimeRatePerHour: string;
  costPerWorkerWeek: string;
};

type SlotsState = Record<SlotKey, DraftState>;

type ReferenceMode = "baseline" | "realistic";

type CustomPreset = {
  name: string;
  /** ISO-String — fuer Anzeige/Sortierung. */
  savedAt: string;
  slots: Record<SlotKey, PlanningInputs>;
};

function inputsToDraft(input: PlanningInputs): DraftState {
  return {
    teamsPerWeek: String(input.teamsPerWeek),
    workersPerTeam: String(input.workersPerTeam),
    regularHoursPerWorkerWeek: String(input.regularHoursPerWorkerWeek),
    overtimeHoursPerWorkerWeek: String(input.overtimeHoursPerWorkerWeek),
    regularRatePerHour: String(input.regularRatePerHour),
    overtimeRatePerHour: String(input.overtimeRatePerHour),
    costPerWorkerWeek: String(input.costPerWorkerWeek),
  };
}

function draftToInputs(draft: DraftState): PlanningInputs {
  const num = (s: string) => {
    const n = Number.parseFloat(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    teamsPerWeek: num(draft.teamsPerWeek),
    workersPerTeam: num(draft.workersPerTeam),
    regularHoursPerWorkerWeek: num(draft.regularHoursPerWorkerWeek),
    overtimeHoursPerWorkerWeek: num(draft.overtimeHoursPerWorkerWeek),
    regularRatePerHour: num(draft.regularRatePerHour),
    overtimeRatePerHour: num(draft.overtimeRatePerHour),
    costPerWorkerWeek: num(draft.costPerWorkerWeek),
    weeksPerMonth: DEFAULT_PLANNING_INPUTS.weeksPerMonth,
  };
}

function defaultSlots(): SlotsState {
  return {
    conservative: inputsToDraft(PRESET_PRESETS.conservative),
    realistic: inputsToDraft(PRESET_PRESETS.realistic),
    aggressive: inputsToDraft(PRESET_PRESETS.aggressive),
  };
}

function loadStoredBaseline(): PlanningInputs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlanningInputs>;
    return sanitizeInputs(parsed);
  } catch {
    return null;
  }
}

function sanitizeInputs(parsed: Partial<PlanningInputs>): PlanningInputs {
  return {
    teamsPerWeek: Number(parsed.teamsPerWeek) || 0,
    workersPerTeam: Number(parsed.workersPerTeam) || 0,
    regularHoursPerWorkerWeek: Number(parsed.regularHoursPerWorkerWeek) || 0,
    overtimeHoursPerWorkerWeek: Number(parsed.overtimeHoursPerWorkerWeek) || 0,
    regularRatePerHour: Number(parsed.regularRatePerHour) || 0,
    overtimeRatePerHour: Number(parsed.overtimeRatePerHour) || 0,
    costPerWorkerWeek: Number(parsed.costPerWorkerWeek) || 0,
    weeksPerMonth: DEFAULT_PLANNING_INPUTS.weeksPerMonth,
  };
}

function loadCustomPresets(): CustomPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.name === "string" && p.slots)
      .map((p) => ({
        name: p.name,
        savedAt: typeof p.savedAt === "string" ? p.savedAt : "",
        slots: {
          conservative: sanitizeInputs(
            (p.slots.conservative ?? {}) as Partial<PlanningInputs>,
          ),
          realistic: sanitizeInputs(
            (p.slots.realistic ?? {}) as Partial<PlanningInputs>,
          ),
          aggressive: sanitizeInputs(
            (p.slots.aggressive ?? {}) as Partial<PlanningInputs>,
          ),
        },
      }));
  } catch {
    return [];
  }
}

function storeCustomPresets(list: CustomPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CUSTOM_PRESETS_STORAGE_KEY,
    JSON.stringify(list),
  );
}

export function WhatIfCalculator() {
  const { t: l, locale } = useI18n();

  const [slots, setSlots] = useState<SlotsState>(() => defaultSlots());
  const [baseline, setBaseline] = useState<PlanningInputs | null>(() =>
    loadStoredBaseline(),
  );
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("baseline");
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() =>
    loadCustomPresets(),
  );
  const [flash, setFlash] = useState<string | null>(null);

  function flashMsg(message: string) {
    setFlash(message);
    setTimeout(() => setFlash(null), 2000);
  }

  // ── Berechnungen pro Slot ─────────────────────────────────────
  const inputsBySlot = useMemo(
    () => ({
      conservative: draftToInputs(slots.conservative),
      realistic: draftToInputs(slots.realistic),
      aggressive: draftToInputs(slots.aggressive),
    }),
    [slots],
  );
  const resultsBySlot = useMemo(
    () => ({
      conservative: calculatePlanning(inputsBySlot.conservative),
      realistic: calculatePlanning(inputsBySlot.realistic),
      aggressive: calculatePlanning(inputsBySlot.aggressive),
    }),
    [inputsBySlot],
  );

  // ── Referenz fuer Delta ───────────────────────────────────────
  const referenceInputs: PlanningInputs | null = useMemo(() => {
    if (referenceMode === "realistic") return inputsBySlot.realistic;
    return baseline;
  }, [referenceMode, inputsBySlot.realistic, baseline]);

  const referenceResult = useMemo(
    () => (referenceInputs ? calculatePlanning(referenceInputs) : null),
    [referenceInputs],
  );

  // ── Formatter ─────────────────────────────────────────────────
  const eur = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const eurDelta = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
        signDisplay: "exceptZero",
      }),
    [locale],
  );
  const percent = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const percentSigned = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
      }),
    [locale],
  );

  // ── Slot-Aktionen ─────────────────────────────────────────────
  function setSlotField<K extends keyof DraftState>(
    slot: SlotKey,
    key: K,
    value: string,
  ) {
    setSlots((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], [key]: value },
    }));
  }

  function resetSlot(slot: SlotKey) {
    setSlots((prev) => ({
      ...prev,
      [slot]: inputsToDraft(PRESET_PRESETS[slot]),
    }));
  }

  function resetAllSlots() {
    setSlots(defaultSlots());
    flashMsg(l("whatif.action.allReset"));
  }

  // ── Baseline-Aktionen ─────────────────────────────────────────
  function saveCurrentRealisticAsBaseline() {
    const r = inputsBySlot.realistic;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(r));
    }
    setBaseline(r);
    flashMsg(l("whatif.baseline.saved"));
  }

  function clearBaseline() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(BASELINE_STORAGE_KEY);
    }
    setBaseline(null);
    if (referenceMode === "baseline") {
      // Damit das Delta-Panel sichtbar bleibt, schalten wir auf realistic.
      setReferenceMode("realistic");
    }
    flashMsg(l("whatif.baseline.reset"));
  }

  // ── Custom-Preset-Aktionen ────────────────────────────────────
  function saveCustomPreset() {
    if (typeof window === "undefined") return;
    const proposedName = `Preset ${new Date().toLocaleString(locale)}`;
    const name = window.prompt(l("whatif.preset.namePrompt"), proposedName);
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const next: CustomPreset = {
      name: trimmed,
      savedAt: new Date().toISOString(),
      slots: { ...inputsBySlot },
    };
    // Existierende mit gleichem Namen ueberschreiben — sonst sammelt sich
    // bei "OK" aus dem prompt() Spam an.
    const without = customPresets.filter((p) => p.name !== trimmed);
    const list = [next, ...without].slice(0, 50);
    setCustomPresets(list);
    storeCustomPresets(list);
    flashMsg(l("whatif.preset.saved"));
  }

  function loadCustomPreset(name: string) {
    const preset = customPresets.find((p) => p.name === name);
    if (!preset) return;
    setSlots({
      conservative: inputsToDraft(preset.slots.conservative),
      realistic: inputsToDraft(preset.slots.realistic),
      aggressive: inputsToDraft(preset.slots.aggressive),
    });
    flashMsg(l("whatif.preset.loaded"));
  }

  function deleteCustomPreset(name: string) {
    const list = customPresets.filter((p) => p.name !== name);
    setCustomPresets(list);
    storeCustomPresets(list);
    flashMsg(l("whatif.preset.deleted"));
  }

  return (
    <div className="grid gap-6">
      <SectionCard
        title={l("whatif.title")}
        subtitle={l("whatif.subtitle")}
      >
        <p className="text-xs text-slate-500">{l("whatif.hint")}</p>
        <p className="mt-1 text-xs text-slate-500">{l("whatif.hintMonthFormula")}</p>
        {flash ? (
          <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-1 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {flash}
          </p>
        ) : null}
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {l("whatif.reference.label")}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReferenceMode("baseline")}
                disabled={!baseline}
                className={cx(
                  "rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                  referenceMode === "baseline"
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-black/10 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300",
                  !baseline ? "opacity-40" : "",
                )}
              >
                {l("whatif.reference.baseline")}
              </button>
              <button
                type="button"
                onClick={() => setReferenceMode("realistic")}
                className={cx(
                  "rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                  referenceMode === "realistic"
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-black/10 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300",
                )}
              >
                {l("whatif.reference.realistic")}
              </button>
            </div>
            {!baseline ? (
              <p className="text-xs text-slate-500">
                {l("whatif.baseline.none")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <PrimaryButton onClick={saveCurrentRealisticAsBaseline}>
              {l("whatif.action.saveBaseline")}
            </PrimaryButton>
            <SecondaryButton onClick={clearBaseline}>
              {l("whatif.action.resetBaseline")}
            </SecondaryButton>
            <SecondaryButton onClick={resetAllSlots}>
              {l("whatif.action.resetAll")}
            </SecondaryButton>
            <SecondaryButton onClick={saveCustomPreset}>
              {l("whatif.preset.saveCurrent")}
            </SecondaryButton>
          </div>
        </div>
        {customPresets.length > 0 ? (
          <div className="mt-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {l("whatif.preset.heading")}
            </label>
            <ul className="mt-1 grid gap-1">
              {customPresets.map((p) => (
                <li
                  key={p.name}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white/60 px-2 py-1 text-xs dark:border-white/10 dark:bg-slate-900/40"
                >
                  <span className="flex-1 font-medium">{p.name}</span>
                  {p.savedAt ? (
                    <span className="text-slate-500">
                      {new Date(p.savedAt).toLocaleString(locale)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => loadCustomPreset(p.name)}
                    className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
                  >
                    {l("whatif.preset.action.load")}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCustomPreset(p.name)}
                    className="rounded-lg border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400"
                  >
                    {l("whatif.preset.action.delete")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      {/* ── Drei Slot-Spalten nebeneinander ───────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {SLOT_KEYS.map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            draft={slots[slot]}
            inputs={inputsBySlot[slot]}
            result={resultsBySlot[slot]}
            eur={eur}
            percent={percent}
            onField={(key, value) => setSlotField(slot, key, value)}
            onReset={() => resetSlot(slot)}
          />
        ))}
      </div>

      {/* ── Vergleich ──────────────────────────────────────────── */}
      <ComparisonTable
        results={resultsBySlot}
        eur={eur}
        percent={percent}
      />

      {/* ── Delta zur Referenz ─────────────────────────────────── */}
      <DeltaTable
        results={resultsBySlot}
        reference={referenceResult}
        referenceMode={referenceMode}
        eur={eur}
        eurDelta={eurDelta}
        percentSigned={percentSigned}
      />
    </div>
  );
}

// ── Slot (eine Spalte mit Eingaben + Mini-KPIs) ───────────────────

function SlotCard({
  slot,
  draft,
  result,
  eur,
  percent,
  onField,
  onReset,
}: {
  slot: SlotKey;
  draft: DraftState;
  inputs: PlanningInputs;
  result: ReturnType<typeof calculatePlanning>;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  onField: <K extends keyof DraftState>(key: K, value: string) => void;
  onReset: () => void;
}) {
  const { t: l } = useI18n();
  const tone =
    slot === "conservative"
      ? "border-slate-300 dark:border-slate-600/40"
      : slot === "realistic"
        ? "border-blue-300 dark:border-blue-500/40"
        : "border-emerald-300 dark:border-emerald-500/40";
  return (
    <SectionCard
      title={l(`whatif.preset.${slot}`)}
      subtitle={l(`whatif.preset.${slot}.subtitle`)}
    >
      <div className={cx("grid gap-3 rounded-2xl border p-3", tone)}>
        {/* Slider+Number-Combos fuer die zentralen Treiber */}
        <SliderField
          label={l("whatif.field.teamsPerWeek")}
          value={draft.teamsPerWeek}
          min={0}
          max={20}
          step={1}
          onChange={(v) => onField("teamsPerWeek", v)}
        />
        <SliderField
          label={l("whatif.field.regularRate")}
          value={draft.regularRatePerHour}
          min={0}
          max={150}
          step={1}
          onChange={(v) => onField("regularRatePerHour", v)}
        />
        <SliderField
          label={l("whatif.field.costPerWorker")}
          value={draft.costPerWorkerWeek}
          min={0}
          max={3500}
          step={25}
          onChange={(v) => onField("costPerWorkerWeek", v)}
        />

        <FormRow>
          <Field
            label={l("whatif.field.workersPerTeam")}
            type="number"
            value={draft.workersPerTeam}
            onChange={(e) => onField("workersPerTeam", e.target.value)}
          />
          <Field
            label={l("whatif.field.overtimeRate")}
            type="number"
            value={draft.overtimeRatePerHour}
            onChange={(e) => onField("overtimeRatePerHour", e.target.value)}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("whatif.field.regularHours")}
            type="number"
            value={draft.regularHoursPerWorkerWeek}
            onChange={(e) => onField("regularHoursPerWorkerWeek", e.target.value)}
          />
          <Field
            label={l("whatif.field.overtimeHours")}
            type="number"
            value={draft.overtimeHoursPerWorkerWeek}
            onChange={(e) => onField("overtimeHoursPerWorkerWeek", e.target.value)}
          />
        </FormRow>

        <div>
          <SecondaryButton onClick={onReset}>
            {l("whatif.action.resetPreset")}
          </SecondaryButton>
        </div>

        <div className="grid gap-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">
              {l("whatif.kpi.weeklyMargin")}
            </span>
            <span
              className={cx(
                "font-mono font-semibold",
                result.weekly.margin >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400",
              )}
            >
              {eur.format(result.weekly.margin)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">
              {l("whatif.kpi.weeklyMarginPercent")}
            </span>
            <span
              className={cx(
                "font-mono",
                result.weekly.marginPercent >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400",
              )}
            >
              {percent.format(result.weekly.marginPercent / 100)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{l("whatif.kpi.workersTotal")}</span>
            <span className="font-mono">{result.workersTotal}</span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Slider mit Number-Input gekoppelt ─────────────────────────────

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  onChange: (next: string) => void;
}) {
  // Slider liest die Zahl aus dem Draft; bei ungueltigen Eingaben
  // (Komma/leer) faellt er auf min zurueck, der Number-Input bleibt
  // editierbar.
  const numeric = Number.parseFloat(value.replace(",", "."));
  const sliderValue = Number.isFinite(numeric) ? numeric : min;
  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 accent-blue-600"
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-xl border border-black/10 bg-white px-2 py-1 text-right text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
        />
      </div>
    </div>
  );
}

// ── Vergleichstabelle (best je Zeile gruen) ──────────────────────

type ComparisonMetric = "revenue" | "cost" | "margin" | "marginPercent";

const COMPARISON_METRICS: ComparisonMetric[] = [
  "revenue",
  "cost",
  "margin",
  "marginPercent",
];

function metricFromPeriod(p: PeriodResult, m: ComparisonMetric): number {
  if (m === "revenue") return p.revenue;
  if (m === "cost") return p.cost;
  if (m === "margin") return p.margin;
  return p.marginPercent;
}

function bestIndex(values: number[], metric: ComparisonMetric): number {
  // Cost: niedrigster Wert ist "am besten". Alle anderen: hoechster.
  const cmp = (a: number, b: number) =>
    metric === "cost" ? a < b : a > b;
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (cmp(values[i], values[best])) best = i;
  }
  return best;
}

function ComparisonTable({
  results,
  eur,
  percent,
}: {
  results: Record<SlotKey, ReturnType<typeof calculatePlanning>>;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  return (
    <SectionCard
      title={l("whatif.compare.heading")}
      subtitle={l("whatif.compare.subtitle")}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
              <th className="py-2 pr-3">{l("whatif.compare.col.metric")}</th>
              {SLOT_KEYS.map((slot) => (
                <th key={slot} className="py-2 pr-3 text-right">
                  {l(`whatif.preset.${slot}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIOD_KEYS.flatMap((period) =>
              COMPARISON_METRICS.map((metric) => {
                const values = SLOT_KEYS.map((slot) =>
                  metricFromPeriod(results[slot][period], metric),
                );
                const best = bestIndex(values, metric);
                const label = `${l(`whatif.period.${period}`)} · ${l(`whatif.delta.metric.${metric}`)}`;
                return (
                  <tr
                    key={`${period}-${metric}`}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 text-xs">{label}</td>
                    {values.map((v, idx) => (
                      <td
                        key={idx}
                        className={cx(
                          "py-1 pr-3 text-right font-mono text-xs",
                          idx === best
                            ? "font-semibold text-emerald-700 dark:text-emerald-300"
                            : "",
                        )}
                      >
                        {metric === "marginPercent"
                          ? percent.format(v / 100)
                          : eur.format(v)}
                      </td>
                    ))}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ── Delta-Tabelle (Slot vs. Referenz) ────────────────────────────

function DeltaTable({
  results,
  reference,
  referenceMode,
  eur,
  eurDelta,
  percentSigned,
}: {
  results: Record<SlotKey, ReturnType<typeof calculatePlanning>>;
  reference: ReturnType<typeof calculatePlanning> | null;
  referenceMode: ReferenceMode;
  eur: Intl.NumberFormat;
  eurDelta: Intl.NumberFormat;
  percentSigned: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  if (!reference) {
    return (
      <SectionCard
        title={l("whatif.delta.heading")}
        subtitle={l("whatif.delta.subtitle")}
      >
        <p className="text-sm text-slate-500">{l("whatif.delta.noReference")}</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title={l("whatif.delta.heading")}
      subtitle={`${l("whatif.delta.subtitle")} (${l(`whatif.reference.${referenceMode}`)})`}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
              <th className="py-2 pr-3">{l("whatif.compare.col.metric")}</th>
              <th className="py-2 pr-3 text-right">{l("whatif.delta.col.reference")}</th>
              {SLOT_KEYS.map((slot) => (
                <th key={slot} className="py-2 pr-3 text-right">
                  {l(`whatif.preset.${slot}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIOD_KEYS.flatMap((period) =>
              (["revenue", "cost", "margin"] as ComparisonMetric[]).map(
                (metric) => {
                  const refValue = metricFromPeriod(reference[period], metric);
                  return (
                    <tr
                      key={`${period}-${metric}`}
                      className="border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className="py-1 pr-3 text-xs">
                        {l(`whatif.period.${period}`)} ·{" "}
                        {l(`whatif.delta.metric.${metric}`)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono text-xs text-slate-500">
                        {eur.format(refValue)}
                      </td>
                      {SLOT_KEYS.map((slot) => {
                        const cur = metricFromPeriod(
                          results[slot][period],
                          metric,
                        );
                        const abs = cur - refValue;
                        const pct =
                          refValue !== 0 ? abs / Math.abs(refValue) : 0;
                        const tone =
                          abs > 0
                            ? metric === "cost"
                              ? "text-red-700 dark:text-red-400"
                              : "text-emerald-700 dark:text-emerald-400"
                            : abs < 0
                              ? metric === "cost"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-red-700 dark:text-red-400"
                              : "text-slate-500";
                        return (
                          <td
                            key={slot}
                            className={cx(
                              "py-1 pr-3 text-right font-mono text-xs",
                              tone,
                            )}
                          >
                            <div>{eurDelta.format(abs)}</div>
                            <div className="text-[10px] opacity-70">
                              {refValue !== 0 ? percentSigned.format(pct) : "—"}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                },
              ),
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
