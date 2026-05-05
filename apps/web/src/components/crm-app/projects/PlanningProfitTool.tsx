"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n-context";
import {
  Field,
  FormRow,
  MessageBar,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  SelectField,
  TextArea,
  cx,
} from "../shared";
import { FinancialKpi } from "./FinancialKpi";
import { apiUrl } from "../types";
import {
  DEFAULT_PLANNING_INPUTS,
  type AlertEvaluateResult,
  type AlertMetric,
  type AlertOperator,
  type AlertSeverity,
  type AlertStatus,
  type BottlenecksApi,
  type BudgetFrequency,
  type CapacityProfileApi,
  type CashflowProjectionApi,
  type CostType,
  type DuplicateStrategy,
  type FinancialKpisApi,
  type PipelineForecastResult,
  type PipelineRange,
  type PipelineScenario,
  type PipelineStage,
  type PlanningBudgetItemApi,
  type PlanningCashflowConfigApi,
  type PlanningPipelineItemApi,
  type UtilizationProjectionApi,
  type UtilizationStatus,
  type ForecastResponse,
  type ImportCommitResponse,
  type ImportDryRunResponse,
  type KpiDashboard,
  type KpiTrendPoint,
  type PeriodKey,
  type PeriodResult,
  type PlanVsActualResponse,
  type PlanningActualApi,
  type PlanningAlertApi,
  type PlanningAlertRuleApi,
  type PlanningBaselineApi,
  type PlanningBaselinePeriodType,
  type PlanningDecisionLogApi,
  type PlanningImportJobApi,
  type PlanningImportJobDetail,
  type PlanningInputs,
  type PlanningOrgRefApi,
  type PlanningResult,
  type PlanningScenarioApi,
  type PlanningVersionApi,
  type ScenarioStatus,
  type SensitivityVariable,
  breakEven,
  calculatePlanning,
  evaluateTargets,
  scenarioToInputs,
  sensitivity,
} from "./planning-calc";

/**
 * Ertragsplanung — Phase 2.
 *
 * Drei Bereiche in einer Komponente:
 *  1) Szenario-Liste (links) inkl. Suche, Sortierung und Vergleichs-Auswahl
 *  2) Editor (rechts) mit Live-KPIs, Speichern/Duplizieren/Loeschen
 *  3) Vergleichs-Tabelle bis zu 3 Szenarien nebeneinander
 *
 * Berechnung kommt zentral aus `planning-calc.ts`. Persistenz ueber
 * `/api/planning/scenarios` (admin-/permission-gated, doppelt gesichert).
 */

type SortKey = "updated" | "name" | "weeklyMargin" | "monthlyMargin";

const MAX_COMPARE = 3;

type EditorState = {
  /** id ist null fuer noch nicht persistierte Entwuerfe. */
  id: string | null;
  name: string;
  description: string;
  inputs: PlanningInputs;
  targets: {
    targetMonthlyRevenue: string; // String fuer Eingabefeld; "" = nicht gesetzt
    targetMonthlyMargin: string;
    targetMarginPercent: string;
  };
};

const EMPTY_EDITOR: EditorState = {
  id: null,
  name: "",
  description: "",
  inputs: { ...DEFAULT_PLANNING_INPUTS },
  targets: {
    targetMonthlyRevenue: "",
    targetMonthlyMargin: "",
    targetMarginPercent: "",
  },
};

export function PlanningProfitTool({
  apiFetch,
  authToken,
  canEditTargets = false,
  canExport = false,
  canEditActuals = false,
  canViewForecast = false,
  canManageVersions = false,
  canImport = false,
  canViewImportLogs = false,
  canViewKpis = false,
  canManageAlerts = false,
  canSubmitReview = false,
  canApproveReview = false,
  canRejectReview = false,
  canManageBaseline = false,
  canViewBudget = false,
  canEditBudget = false,
  canViewCashflow = false,
  canViewCapacity = false,
  canEditCapacity = false,
  canViewPipeline = false,
  canEditPipeline = false,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Wird fuer direkte Datei-Downloads (CSV/PDF) gebraucht. */
  authToken?: string;
  canEditTargets?: boolean;
  canExport?: boolean;
  canEditActuals?: boolean;
  canViewForecast?: boolean;
  canManageVersions?: boolean;
  canImport?: boolean;
  canViewImportLogs?: boolean;
  canViewKpis?: boolean;
  canManageAlerts?: boolean;
  canSubmitReview?: boolean;
  canApproveReview?: boolean;
  canRejectReview?: boolean;
  canManageBaseline?: boolean;
  canViewBudget?: boolean;
  canEditBudget?: boolean;
  canViewCashflow?: boolean;
  canViewCapacity?: boolean;
  canEditCapacity?: boolean;
  canViewPipeline?: boolean;
  canEditPipeline?: boolean;
}) {
  const { t: l, locale } = useI18n();

  const [scenarios, setScenarios] = useState<PlanningScenarioApi[] | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [originalEditor, setOriginalEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  /** Bump um Actuals-/Historie-Listen extern nachzuladen (z. B. nach Import). */
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Phase 7: Filter + Lookup-Listen.
  const [filterLocationId, setFilterLocationId] = useState<string>("");
  const [filterUnitId, setFilterUnitId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"" | ScenarioStatus>("");
  const [locations, setLocations] = useState<PlanningOrgRefApi[]>([]);
  const [businessUnits, setBusinessUnits] = useState<PlanningOrgRefApi[]>([]);

  const flashSuccess = useCallback((message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 2200);
  }, []);

  const loadScenarios = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterLocationId) params.set("locationId", filterLocationId);
      if (filterUnitId) params.set("businessUnitId", filterUnitId);
      if (filterStatus) params.set("status", filterStatus);
      const list = await apiFetch<PlanningScenarioApi[]>(
        `/planning/scenarios${params.size ? `?${params.toString()}` : ""}`,
      );
      setScenarios(list);
      setPermissionDenied(false);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/403|forbidden|verweigert|denied/i.test(msg)) {
        setPermissionDenied(true);
        setScenarios([]);
      } else {
        setError(msg || l("common.error"));
      }
    }
  }, [apiFetch, filterLocationId, filterUnitId, filterStatus, l]);

  useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);

  // Lookup-Listen fuer Filter + Org-Tags + Baseline-Form.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<PlanningOrgRefApi[]>("/planning/locations"),
      apiFetch<PlanningOrgRefApi[]>("/planning/business-units"),
    ])
      .then(([locs, units]) => {
        if (cancelled) return;
        setLocations(locs);
        setBusinessUnits(units);
      })
      .catch(() => {
        // Fehler hier nicht eskalieren — Filter funktionieren auch ohne Lookups.
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, refreshNonce]);

  // ── Editor: aktiv? geaendert? ─────────────────────
  const isDirty = useMemo(() => {
    return JSON.stringify(editor) !== JSON.stringify(originalEditor);
  }, [editor, originalEditor]);

  function startNew() {
    setEditor(EMPTY_EDITOR);
    setOriginalEditor(EMPTY_EDITOR);
    setError(null);
  }

  function loadIntoEditor(scenario: PlanningScenarioApi) {
    const next: EditorState = {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description ?? "",
      inputs: scenarioToInputs(scenario),
      targets: {
        targetMonthlyRevenue:
          scenario.targetMonthlyRevenue != null
            ? String(scenario.targetMonthlyRevenue)
            : "",
        targetMonthlyMargin:
          scenario.targetMonthlyMargin != null
            ? String(scenario.targetMonthlyMargin)
            : "",
        targetMarginPercent:
          scenario.targetMarginPercent != null
            ? String(scenario.targetMarginPercent)
            : "",
      },
    };
    setEditor(next);
    setOriginalEditor(next);
    setError(null);
  }

  function discardChanges() {
    setEditor(originalEditor);
  }

  function setInputField<K extends keyof PlanningInputs>(key: K, value: string) {
    const num = Number.parseFloat(value.replace(",", "."));
    setEditor((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [key]: Number.isFinite(num) && num >= 0 ? num : 0 },
    }));
  }

  function setNameField(value: string) {
    setEditor((prev) => ({ ...prev, name: value }));
  }
  function setDescriptionField(value: string) {
    setEditor((prev) => ({ ...prev, description: value }));
  }

  // ── CRUD ──────────────────────────────────────────

  async function saveCurrent() {
    if (!editor.name.trim()) {
      setError(l("common.error"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: editor.name.trim(),
        description: editor.description.trim() || undefined,
        ...editor.inputs,
      };
      let saved: PlanningScenarioApi;
      if (editor.id) {
        saved = await apiFetch<PlanningScenarioApi>(
          `/planning/scenarios/${editor.id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
      } else {
        saved = await apiFetch<PlanningScenarioApi>(
          "/planning/scenarios",
          { method: "POST", body: JSON.stringify(payload) },
        );
      }
      const next: EditorState = {
        id: saved.id,
        name: saved.name,
        description: saved.description ?? "",
        inputs: scenarioToInputs(saved),
        targets: {
          targetMonthlyRevenue:
            saved.targetMonthlyRevenue != null
              ? String(saved.targetMonthlyRevenue)
              : "",
          targetMonthlyMargin:
            saved.targetMonthlyMargin != null
              ? String(saved.targetMonthlyMargin)
              : "",
          targetMarginPercent:
            saved.targetMarginPercent != null
              ? String(saved.targetMarginPercent)
              : "",
        },
      };
      setEditor(next);
      setOriginalEditor(next);
      flashSuccess(l("profit.editor.saved"));
      await loadScenarios();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function duplicateCurrent() {
    if (!editor.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiFetch<PlanningScenarioApi>(
        `/planning/scenarios/${editor.id}/duplicate`,
        { method: "POST" },
      );
      flashSuccess(l("profit.editor.duplicated"));
      await loadScenarios();
      loadIntoEditor(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteCurrent() {
    if (!editor.id) return;
    if (typeof window !== "undefined" && !window.confirm(l("profit.editor.confirmDelete"))) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/planning/scenarios/${editor.id}`, { method: "DELETE" });
      flashSuccess(l("profit.editor.deleted"));
      setCompareIds((prev) => prev.filter((id) => id !== editor.id));
      startNew();
      await loadScenarios();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Targets ───────────────────────────────────────

  function setTargetField(
    key: keyof EditorState["targets"],
    value: string,
  ) {
    setEditor((prev) => ({
      ...prev,
      targets: { ...prev.targets, [key]: value },
    }));
  }

  /** Leerstring → null, sonst auf Number parsen. */
  function parseTargetField(value: string): number | null {
    const t = value.trim();
    if (!t) return null;
    const n = Number.parseFloat(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  async function saveTargets() {
    if (!editor.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        targetMonthlyRevenue: parseTargetField(editor.targets.targetMonthlyRevenue),
        targetMonthlyMargin: parseTargetField(editor.targets.targetMonthlyMargin),
        targetMarginPercent: parseTargetField(editor.targets.targetMarginPercent),
      };
      const updated = await apiFetch<PlanningScenarioApi>(
        `/planning/scenarios/${editor.id}/targets`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      const next: EditorState = {
        ...editor,
        targets: {
          targetMonthlyRevenue:
            updated.targetMonthlyRevenue != null
              ? String(updated.targetMonthlyRevenue)
              : "",
          targetMonthlyMargin:
            updated.targetMonthlyMargin != null
              ? String(updated.targetMonthlyMargin)
              : "",
          targetMarginPercent:
            updated.targetMarginPercent != null
              ? String(updated.targetMarginPercent)
              : "",
        },
      };
      setEditor(next);
      setOriginalEditor(next);
      flashSuccess(l("profit.targets.saved"));
      await loadScenarios();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function clearTargets() {
    setEditor((prev) => ({
      ...prev,
      targets: {
        targetMonthlyRevenue: "",
        targetMonthlyMargin: "",
        targetMarginPercent: "",
      },
    }));
  }

  // ── Export (Datei-Download) ──────────────────────
  // apiFetch wirft auf nicht-200 Fehlern; ungetrennt vom Body-Stream.
  // Daher direkt mit fetch() arbeiten und Auth-Header manuell setzen.

  const downloadFile = useCallback(
    async (path: string, init: RequestInit, fallbackName: string) => {
      const response = await fetch(apiUrl(path), {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] ?? fallbackName;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [authToken],
  );

  async function exportSingle(format: "csv" | "pdf") {
    if (!editor.id) return;
    setError(null);
    try {
      await downloadFile(
        `/planning/scenarios/${editor.id}/export/${format}`,
        { method: "POST" },
        `planning.${format}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : l("profit.export.failed"));
    }
  }

  async function exportCompare(format: "csv" | "pdf", ids: string[]) {
    if (ids.length === 0) return;
    setError(null);
    try {
      await downloadFile(
        `/planning/compare/export/${format}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        },
        `planning-compare.${format}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : l("profit.export.failed"));
    }
  }

  // ── Listenfilter + Sortierung ─────────────────────

  const visibleScenarios = useMemo(() => {
    if (!scenarios) return [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? scenarios.filter((s) => s.name.toLowerCase().includes(term))
      : scenarios;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, locale);
        case "weeklyMargin":
          return calculatePlanning(scenarioToInputs(b)).weekly.margin -
            calculatePlanning(scenarioToInputs(a)).weekly.margin;
        case "monthlyMargin":
          return calculatePlanning(scenarioToInputs(b)).monthly.margin -
            calculatePlanning(scenarioToInputs(a)).monthly.margin;
        case "updated":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
    return sorted;
  }, [scenarios, search, sortKey, locale]);

  // ── Vergleich-Auswahl ─────────────────────────────

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }

  const compareScenarios = useMemo(() => {
    if (!scenarios) return [];
    return compareIds
      .map((id) => scenarios.find((s) => s.id === id))
      .filter((s): s is PlanningScenarioApi => s != null);
  }, [scenarios, compareIds]);

  // ── Formatter ─────────────────────────────────────
  const eur = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const eurDetail = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
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
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }),
    [locale],
  );

  if (permissionDenied) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {l("profit.permissionMissing")}
      </div>
    );
  }

  const liveResult = calculatePlanning(editor.inputs);

  return (
    <div className="grid gap-6">
      <SectionCard title={l("profit.title")} subtitle={l("profit.subtitle")}>
        <p className="mb-3 text-xs text-slate-500">{l("profit.assumptionsHint")}</p>
        <MessageBar error={error} success={success} />
      </SectionCard>

      {canViewKpis ? (
        <KpiDashboardPanel
          apiFetch={apiFetch}
          eur={eur}
          percent={percent}
          refreshNonce={refreshNonce}
          setError={setError}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* ── Liste links ─────────────────────────── */}
        <ScenarioListPanel
          scenarios={visibleScenarios}
          loading={scenarios === null}
          search={search}
          setSearch={setSearch}
          sortKey={sortKey}
          setSortKey={setSortKey}
          editorId={editor.id}
          compareIds={compareIds}
          onSelect={loadIntoEditor}
          onNew={startNew}
          onToggleCompare={toggleCompare}
          locations={locations}
          businessUnits={businessUnits}
          filterLocationId={filterLocationId}
          setFilterLocationId={setFilterLocationId}
          filterUnitId={filterUnitId}
          setFilterUnitId={setFilterUnitId}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
        />

        {/* ── Editor rechts ───────────────────────── */}
        <div className="grid gap-6">
          <SectionCard
            title={
              editor.id
                ? `${l("profit.editor.heading")} — ${editor.name || "—"}`
                : l("profit.editor.heading")
            }
            subtitle={
              editor.id
                ? `${l("profit.editor.savedAt")}: ${
                    scenarios?.find((s) => s.id === editor.id)?.updatedAt
                      ? dateTime.format(
                          new Date(
                            scenarios!.find((s) => s.id === editor.id)!.updatedAt,
                          ),
                        )
                      : "—"
                  }`
                : l("profit.editor.empty")
            }
          >
            <EditorBody
              editor={editor}
              setNameField={setNameField}
              setDescriptionField={setDescriptionField}
              setInputField={setInputField}
              isDirty={isDirty}
              submitting={submitting}
              onSave={saveCurrent}
              onDiscard={discardChanges}
              onDelete={deleteCurrent}
              onDuplicate={duplicateCurrent}
              canExport={canExport}
              onExportCsv={() => void exportSingle("csv")}
              onExportPdf={() => void exportSingle("pdf")}
            />
          </SectionCard>

          {editor.id ? (
            <WorkflowPanel
              apiFetch={apiFetch}
              scenario={scenarios?.find((s) => s.id === editor.id) ?? null}
              locations={locations}
              businessUnits={businessUnits}
              dateTime={dateTime}
              canSubmit={canSubmitReview}
              canApprove={canApproveReview}
              canReject={canRejectReview}
              canManageBaseline={canManageBaseline}
              flashSuccess={flashSuccess}
              setError={setError}
              onChanged={() => {
                void loadScenarios();
                setRefreshNonce((n) => n + 1);
              }}
            />
          ) : null}

          {editor.id && canViewBudget ? (
            <BudgetPanel
              apiFetch={apiFetch}
              scenarioId={editor.id}
              canEdit={canEditBudget}
              eur={eur}
              percent={percent}
              flashSuccess={flashSuccess}
              setError={setError}
              refreshNonce={refreshNonce}
              onChanged={() => setRefreshNonce((n) => n + 1)}
            />
          ) : null}

          {editor.id && canViewCashflow ? (
            <CashflowPanel
              apiFetch={apiFetch}
              scenarioId={editor.id}
              canEditConfig={canEditBudget}
              eur={eur}
              flashSuccess={flashSuccess}
              setError={setError}
              refreshNonce={refreshNonce}
              onChanged={() => setRefreshNonce((n) => n + 1)}
            />
          ) : null}

          {editor.id && canViewCapacity ? (
            <CapacityPanel
              apiFetch={apiFetch}
              scenarioId={editor.id}
              canEdit={canEditCapacity}
              percent={percent}
              flashSuccess={flashSuccess}
              setError={setError}
              refreshNonce={refreshNonce}
              onChanged={() => setRefreshNonce((n) => n + 1)}
            />
          ) : null}

          {editor.id ? (
            <TargetsPanel
              editor={editor}
              liveResult={liveResult}
              canEdit={canEditTargets}
              submitting={submitting}
              setTargetField={setTargetField}
              onSave={saveTargets}
              onClear={clearTargets}
              eur={eur}
              percent={percent}
            />
          ) : null}

          {editor.id ? (
            <ActualsPanel
              apiFetch={apiFetch}
              canEdit={canEditActuals}
              eur={eur}
              flashSuccess={flashSuccess}
              setError={setError}
              refreshNonce={refreshNonce}
            />
          ) : null}

          {editor.id && canViewForecast ? (
            <PlanVsActualPanel
              apiFetch={apiFetch}
              scenarioId={editor.id}
              eur={eur}
              percent={percent}
            />
          ) : null}

          {editor.id && canViewForecast ? (
            <ForecastPanel
              apiFetch={apiFetch}
              scenarioId={editor.id}
              eur={eur}
              percent={percent}
            />
          ) : null}

          {editor.id ? (
            <VersionsPanel
              apiFetch={apiFetch}
              scenarioId={editor.id}
              canManage={canManageVersions}
              dateTime={dateTime}
              flashSuccess={flashSuccess}
              setError={setError}
              onRestored={async () => {
                await loadScenarios();
                if (editor.id) {
                  const refreshed = await apiFetch<PlanningScenarioApi>(
                    `/planning/scenarios/${editor.id}`,
                  );
                  loadIntoEditor(refreshed);
                }
              }}
            />
          ) : null}

          <BreakEvenPanel
            inputs={editor.inputs}
            eur={eur}
            eurDetail={eurDetail}
            percent={percent}
          />

          <SensitivityPanel inputs={editor.inputs} eur={eur} percent={percent} />

          <KpiPanel result={liveResult} eur={eur} eurDetail={eurDetail} percent={percent} />
        </div>
      </div>

      {/* ── Vergleich ───────────────────────────────── */}
      <CompareTable
        scenarios={compareScenarios}
        eur={eur}
        percent={percent}
        canExport={canExport}
        onExportCsv={() => void exportCompare("csv", compareScenarios.map((s) => s.id))}
        onExportPdf={() => void exportCompare("pdf", compareScenarios.map((s) => s.id))}
        onClear={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
        onOpen={(s) => loadIntoEditor(s)}
      />

      {/* ── Phase 5: Import & BI-Anbindung ─────────── */}
      {canImport ? (
        <ImportPanel
          apiFetch={apiFetch}
          eur={eur}
          flashSuccess={flashSuccess}
          setError={setError}
          onImported={() => setRefreshNonce((n) => n + 1)}
        />
      ) : null}

      {canViewImportLogs ? (
        <ImportHistoryPanel
          apiFetch={apiFetch}
          authToken={authToken}
          dateTime={dateTime}
          refreshNonce={refreshNonce}
          setError={setError}
        />
      ) : null}

      {canManageAlerts ? (
        <AlertRulesPanel
          apiFetch={apiFetch}
          scenarios={scenarios ?? []}
          flashSuccess={flashSuccess}
          setError={setError}
          onChanged={() => setRefreshNonce((n) => n + 1)}
        />
      ) : null}

      {canManageAlerts ? (
        <AlertsListPanel
          apiFetch={apiFetch}
          dateTime={dateTime}
          refreshNonce={refreshNonce}
          flashSuccess={flashSuccess}
          setError={setError}
          onChanged={() => setRefreshNonce((n) => n + 1)}
        />
      ) : null}

      <BaselinesListPanel
        apiFetch={apiFetch}
        dateTime={dateTime}
        canManage={canManageBaseline}
        refreshNonce={refreshNonce}
        flashSuccess={flashSuccess}
        setError={setError}
        onChanged={() => setRefreshNonce((n) => n + 1)}
      />

      {canViewPipeline ? (
        <PipelinePanel
          apiFetch={apiFetch}
          canEdit={canEditPipeline}
          eur={eur}
          percent={percent}
          flashSuccess={flashSuccess}
          setError={setError}
          refreshNonce={refreshNonce}
          onChanged={() => setRefreshNonce((n) => n + 1)}
        />
      ) : null}

      <OrgManagementPanel
        apiFetch={apiFetch}
        flashSuccess={flashSuccess}
        setError={setError}
        onChanged={() => setRefreshNonce((n) => n + 1)}
      />
    </div>
  );
}

// ── Sub-Komponenten ────────────────────────────────────────────

function ScenarioListPanel({
  scenarios,
  loading,
  search,
  setSearch,
  sortKey,
  setSortKey,
  editorId,
  compareIds,
  onSelect,
  onNew,
  onToggleCompare,
  locations,
  businessUnits,
  filterLocationId,
  setFilterLocationId,
  filterUnitId,
  setFilterUnitId,
  filterStatus,
  setFilterStatus,
}: {
  scenarios: PlanningScenarioApi[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  editorId: string | null;
  compareIds: string[];
  onSelect: (s: PlanningScenarioApi) => void;
  onNew: () => void;
  onToggleCompare: (id: string) => void;
  locations: PlanningOrgRefApi[];
  businessUnits: PlanningOrgRefApi[];
  filterLocationId: string;
  setFilterLocationId: (v: string) => void;
  filterUnitId: string;
  setFilterUnitId: (v: string) => void;
  filterStatus: "" | ScenarioStatus;
  setFilterStatus: (v: "" | ScenarioStatus) => void;
}) {
  const { t: l } = useI18n();
  return (
    <SectionCard
      title={l("profit.list.heading")}
      subtitle={
        compareIds.length > 0
          ? l("profit.list.compareSelected").replace("{count}", String(compareIds.length))
          : l("profit.subtitle")
      }
    >
      <div className="grid gap-3">
        <button
          type="button"
          onClick={onNew}
          className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
        >
          {l("profit.list.action.new")}
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={l("profit.list.searchPlaceholder")}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
        />
        <SelectField
          label={l("profit.list.sortLabel")}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          options={[
            { value: "updated", label: l("profit.list.sort.updated") },
            { value: "name", label: l("profit.list.sort.name") },
            { value: "weeklyMargin", label: l("profit.list.sort.weeklyMargin") },
            { value: "monthlyMargin", label: l("profit.list.sort.monthlyMargin") },
          ]}
        />
        <SelectField
          label={l("profit.org.field.locationOrAll")}
          value={filterLocationId}
          onChange={(e) => setFilterLocationId(e.target.value)}
          options={[
            { value: "", label: l("profit.org.filter.allLocations") },
            ...locations.map((loc) => ({
              value: loc.id,
              label: `${loc.name} (${loc.code})`,
            })),
          ]}
        />
        <SelectField
          label={l("profit.org.field.unitOrAll")}
          value={filterUnitId}
          onChange={(e) => setFilterUnitId(e.target.value)}
          options={[
            { value: "", label: l("profit.org.filter.allUnits") },
            ...businessUnits.map((u) => ({
              value: u.id,
              label: `${u.name} (${u.code})`,
            })),
          ]}
        />
        <SelectField
          label={l("profit.alerts.col.status")}
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as "" | ScenarioStatus)
          }
          options={[
            { value: "", label: l("profit.org.filter.statusAll") },
            { value: "DRAFT", label: l("profit.workflow.status.DRAFT") },
            { value: "IN_REVIEW", label: l("profit.workflow.status.IN_REVIEW") },
            { value: "APPROVED", label: l("profit.workflow.status.APPROVED") },
            { value: "REJECTED", label: l("profit.workflow.status.REJECTED") },
            { value: "ARCHIVED", label: l("profit.workflow.status.ARCHIVED") },
          ]}
        />

        {compareIds.length >= MAX_COMPARE ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {l("profit.list.compareLimit")}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
        ) : scenarios.length === 0 ? (
          <p className="text-sm text-slate-500">{l("profit.list.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {scenarios.map((s) => {
              const active = s.id === editorId;
              const inCompare = compareIds.includes(s.id);
              const compareDisabled = !inCompare && compareIds.length >= MAX_COMPARE;
              return (
                <li
                  key={s.id}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm transition",
                    active
                      ? "border-blue-400 bg-blue-50/60 dark:border-blue-500/40 dark:bg-blue-500/10"
                      : "border-black/10 bg-white/60 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/40 dark:hover:bg-slate-800/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(s)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate font-medium">{s.name}</span>
                        {s.status ? <StatusBadge status={s.status} /> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {s.location ? (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                            {s.location.code}
                          </span>
                        ) : null}
                        {s.businessUnit ? (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
                            {s.businessUnit.code}
                          </span>
                        ) : null}
                        {s.description ? (
                          <span className="truncate">{s.description}</span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleCompare(s.id)}
                      disabled={compareDisabled}
                      title={
                        inCompare
                          ? l("profit.list.unselectForCompare")
                          : l("profit.list.selectForCompare")
                      }
                      className={cx(
                        "shrink-0 rounded-lg border px-2 py-0.5 text-xs font-medium transition",
                        inCompare
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "border-black/10 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300",
                        compareDisabled ? "opacity-40" : "",
                      )}
                    >
                      {inCompare ? "✓" : "+"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function EditorBody({
  editor,
  setNameField,
  setDescriptionField,
  setInputField,
  isDirty,
  submitting,
  onSave,
  onDiscard,
  onDelete,
  onDuplicate,
  canExport,
  onExportCsv,
  onExportPdf,
}: {
  editor: EditorState;
  setNameField: (v: string) => void;
  setDescriptionField: (v: string) => void;
  setInputField: <K extends keyof PlanningInputs>(key: K, value: string) => void;
  isDirty: boolean;
  submitting: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onDelete: () => void | Promise<void>;
  onDuplicate: () => void | Promise<void>;
  canExport?: boolean;
  onExportCsv?: () => void;
  onExportPdf?: () => void;
}) {
  const { t: l } = useI18n();
  return (
    <div className="grid gap-4">
      <FormRow>
        <Field
          label={l("profit.scenario.name")}
          value={editor.name}
          onChange={(e) => setNameField(e.target.value)}
          placeholder={l("profit.scenario.namePlaceholder")}
        />
        <Field
          label={l("profit.editor.fieldWeeksPerMonth")}
          type="number"
          value={String(editor.inputs.weeksPerMonth)}
          onChange={(e) => setInputField("weeksPerMonth", e.target.value)}
        />
      </FormRow>
      <TextArea
        label={l("profit.editor.fieldDescription")}
        value={editor.description}
        onChange={(e) => setDescriptionField(e.target.value)}
      />

      <fieldset className="rounded-2xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {l("profit.section.team")}
        </legend>
        <FormRow>
          <Field
            label={l("profit.field.teamsPerWeek")}
            type="number"
            value={String(editor.inputs.teamsPerWeek)}
            onChange={(e) => setInputField("teamsPerWeek", e.target.value)}
          />
          <Field
            label={l("profit.field.workersPerTeam")}
            type="number"
            value={String(editor.inputs.workersPerTeam)}
            onChange={(e) => setInputField("workersPerTeam", e.target.value)}
          />
        </FormRow>
      </fieldset>

      <fieldset className="rounded-2xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {l("profit.section.hours")}
        </legend>
        <FormRow>
          <Field
            label={l("profit.field.regularHours")}
            type="number"
            value={String(editor.inputs.regularHoursPerWorkerWeek)}
            onChange={(e) => setInputField("regularHoursPerWorkerWeek", e.target.value)}
          />
          <Field
            label={l("profit.field.overtimeHours")}
            type="number"
            value={String(editor.inputs.overtimeHoursPerWorkerWeek)}
            onChange={(e) => setInputField("overtimeHoursPerWorkerWeek", e.target.value)}
          />
        </FormRow>
      </fieldset>

      <fieldset className="rounded-2xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {l("profit.section.rates")}
        </legend>
        <FormRow>
          <Field
            label={l("profit.field.regularRate")}
            type="number"
            value={String(editor.inputs.regularRatePerHour)}
            onChange={(e) => setInputField("regularRatePerHour", e.target.value)}
          />
          <Field
            label={l("profit.field.overtimeRate")}
            type="number"
            value={String(editor.inputs.overtimeRatePerHour)}
            onChange={(e) => setInputField("overtimeRatePerHour", e.target.value)}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.field.costPerWorker")}
            type="number"
            value={String(editor.inputs.costPerWorkerWeek)}
            onChange={(e) => setInputField("costPerWorkerWeek", e.target.value)}
          />
          <div />
        </FormRow>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <PrimaryButton
          disabled={submitting || !editor.name.trim()}
          onClick={() => void onSave()}
        >
          {submitting ? l("profit.editor.savePending") : l("profit.editor.action.save")}
        </PrimaryButton>
        {isDirty && editor.id ? (
          <SecondaryButton onClick={onDiscard}>
            {l("profit.editor.action.discard")}
          </SecondaryButton>
        ) : null}
        {editor.id ? (
          <SecondaryButton onClick={() => void onDuplicate()}>
            {l("profit.editor.action.duplicate")}
          </SecondaryButton>
        ) : null}
        {editor.id ? (
          <button
            type="button"
            onClick={() => void onDelete()}
            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400"
          >
            {l("profit.editor.action.delete")}
          </button>
        ) : null}
        {editor.id && canExport && onExportCsv ? (
          <SecondaryButton onClick={onExportCsv}>{l("profit.export.csv")}</SecondaryButton>
        ) : null}
        {editor.id && canExport && onExportPdf ? (
          <SecondaryButton onClick={onExportPdf}>{l("profit.export.pdf")}</SecondaryButton>
        ) : null}
        {isDirty ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {l("profit.editor.unsaved")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function KpiPanel({
  result,
  eur,
  eurDetail,
  percent,
}: {
  result: PlanningResult;
  eur: Intl.NumberFormat;
  eurDetail: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  const blocks: Array<{ key: PeriodKey; label: string; data: PeriodResult }> = [
    { key: "weekly", label: l("profit.kpi.weekly"), data: result.weekly },
    { key: "monthly", label: l("profit.kpi.monthly"), data: result.monthly },
    { key: "quarterly", label: l("profit.kpi.quarterly"), data: result.quarterly },
    { key: "halfYear", label: l("profit.kpi.halfYear"), data: result.halfYear },
  ];
  return (
    <SectionCard title={l("profit.kpi.weekly")} subtitle={l("profit.subtitle")}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialKpi
          label={l("profit.kpi.marginPercent")}
          value={percent.format(result.marginPercent / 100)}
          highlight={result.marginPercent >= 0}
          warn={result.marginPercent < 0}
        />
        <FinancialKpi
          label={l("profit.kpi.workersTotal")}
          value={String(result.workersTotal)}
        />
        <FinancialKpi
          label={`${l("profit.kpi.revenue")} / ${l("profit.field.regularHours")}`}
          value={eurDetail.format(result.revenuePerWorkerWeek)}
        />
        <FinancialKpi
          label={`${l("profit.kpi.weekly")} · ${l("profit.kpi.margin")}`}
          value={eur.format(result.weekly.margin)}
          highlight={result.weekly.margin >= 0}
          warn={result.weekly.margin < 0}
        />
      </div>
      <div className="mt-5 grid gap-4">
        {blocks.map((block) => {
          const positive = block.data.margin >= 0;
          return (
            <div
              key={block.key}
              className={cx(
                "rounded-2xl border bg-white/60 p-3 dark:bg-slate-900/40",
                positive
                  ? "border-emerald-200 dark:border-emerald-500/30"
                  : "border-red-200 dark:border-red-500/30",
              )}
            >
              <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {block.label}
              </h4>
              <div className="grid gap-2 sm:grid-cols-3">
                <FinancialKpi
                  label={l("profit.kpi.revenue")}
                  value={eur.format(block.data.revenue)}
                />
                <FinancialKpi
                  label={l("profit.kpi.cost")}
                  value={eur.format(block.data.cost)}
                />
                <FinancialKpi
                  label={l("profit.kpi.margin")}
                  value={eur.format(block.data.margin)}
                  highlight={positive}
                  warn={!positive}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function CompareTable({
  scenarios,
  eur,
  percent,
  onClear,
  onOpen,
  canExport,
  onExportCsv,
  onExportPdf,
}: {
  scenarios: PlanningScenarioApi[];
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  onClear: (id: string) => void;
  onOpen: (s: PlanningScenarioApi) => void;
  canExport?: boolean;
  onExportCsv?: () => void;
  onExportPdf?: () => void;
}) {
  const { t: l } = useI18n();
  if (scenarios.length === 0) {
    return (
      <SectionCard title={l("profit.compare.heading")} subtitle={l("profit.compare.subtitle")}>
        <p className="text-sm text-slate-500">{l("profit.compare.empty")}</p>
      </SectionCard>
    );
  }
  const calcs = scenarios.map((s) => calculatePlanning(scenarioToInputs(s)));

  type Row = { label: string; values: string[]; tone?: "neutral" | "marginEur" | "marginPct" };
  const rows: Row[] = [];
  rows.push({
    label: l("profit.kpi.workersTotal"),
    values: calcs.map((r) => String(r.workersTotal)),
  });
  rows.push({
    label: l("profit.kpi.marginPercent"),
    values: calcs.map((r) => percent.format(r.marginPercent / 100)),
    tone: "marginPct",
  });
  for (const period of ["weekly", "monthly", "quarterly", "halfYear"] as const) {
    const periodLabel = l(
      period === "weekly"
        ? "profit.kpi.weekly"
        : period === "monthly"
          ? "profit.kpi.monthly"
          : period === "quarterly"
            ? "profit.kpi.quarterly"
            : "profit.kpi.halfYear",
    );
    rows.push({
      label: `${periodLabel} · ${l("profit.kpi.revenue")}`,
      values: calcs.map((r) => eur.format(r[period].revenue)),
    });
    rows.push({
      label: `${periodLabel} · ${l("profit.kpi.cost")}`,
      values: calcs.map((r) => eur.format(r[period].cost)),
    });
    rows.push({
      label: `${periodLabel} · ${l("profit.kpi.margin")}`,
      values: calcs.map((r) => eur.format(r[period].margin)),
      tone: "marginEur",
    });
  }

  return (
    <SectionCard title={l("profit.compare.heading")} subtitle={l("profit.compare.subtitle")}>
      {canExport && (onExportCsv || onExportPdf) ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {onExportCsv ? (
            <SecondaryButton onClick={onExportCsv}>{l("profit.export.compareCsv")}</SecondaryButton>
          ) : null}
          {onExportPdf ? (
            <SecondaryButton onClick={onExportPdf}>{l("profit.export.comparePdf")}</SecondaryButton>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
              <th className="py-2 pr-3">{l("profit.compare.metric")}</th>
              {scenarios.map((s) => (
                <th key={s.id} className="py-2 pr-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(s)}
                      className="truncate text-left text-sm font-semibold text-slate-700 hover:underline dark:text-slate-200"
                      title={l("profit.compare.openEditor")}
                    >
                      {s.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onClear(s.id)}
                      className="shrink-0 rounded-lg border border-black/10 px-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // Beste Marge je Zeile dezent hervorheben.
              const numericValues =
                row.tone === "marginEur" || row.tone === "marginPct"
                  ? calcs.map((r) => {
                      if (row.tone === "marginEur") {
                        return /weekly|monthly|quarterly|halfYear/.exec(row.label)
                          ? row.label.includes(l("profit.kpi.weekly"))
                            ? r.weekly.margin
                            : row.label.includes(l("profit.kpi.monthly"))
                              ? r.monthly.margin
                              : row.label.includes(l("profit.kpi.quarterly"))
                                ? r.quarterly.margin
                                : r.halfYear.margin
                          : r.weekly.margin;
                      }
                      return r.marginPercent;
                    })
                  : null;
              const bestIdx =
                numericValues != null
                  ? numericValues.indexOf(Math.max(...numericValues))
                  : -1;
              return (
                <tr key={row.label} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="py-2 pr-3 text-xs text-slate-500">{row.label}</td>
                  {row.values.map((v, idx) => (
                    <td
                      key={idx}
                      className={cx(
                        "py-2 pr-3 font-mono text-sm",
                        row.tone && bestIdx === idx
                          ? "font-semibold text-emerald-700 dark:text-emerald-300"
                          : "",
                      )}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ── Phase 3: Targets / Break-even / Sensitivity ────────────────

function TargetsPanel({
  editor,
  liveResult,
  canEdit,
  submitting,
  setTargetField,
  onSave,
  onClear,
  eur,
  percent,
}: {
  editor: EditorState;
  liveResult: PlanningResult;
  canEdit: boolean;
  submitting: boolean;
  setTargetField: (key: keyof EditorState["targets"], value: string) => void;
  onSave: () => void | Promise<void>;
  onClear: () => void;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  const targets = {
    targetMonthlyRevenue:
      editor.targets.targetMonthlyRevenue.trim() === ""
        ? null
        : Number.parseFloat(editor.targets.targetMonthlyRevenue.replace(",", ".")),
    targetMonthlyMargin:
      editor.targets.targetMonthlyMargin.trim() === ""
        ? null
        : Number.parseFloat(editor.targets.targetMonthlyMargin.replace(",", ".")),
    targetMarginPercent:
      editor.targets.targetMarginPercent.trim() === ""
        ? null
        : Number.parseFloat(editor.targets.targetMarginPercent.replace(",", ".")),
  };
  const checks = evaluateTargets(liveResult, targets);
  const anyTargetSet =
    targets.targetMonthlyRevenue != null ||
    targets.targetMonthlyMargin != null ||
    targets.targetMarginPercent != null;

  return (
    <SectionCard
      title={l("profit.targets.heading")}
      subtitle={l("profit.targets.subtitle")}
    >
      {!canEdit ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {l("profit.targets.requiresPermission")}
        </p>
      ) : null}

      <div className="grid gap-3">
        <FormRow>
          <Field
            label={l("profit.targets.fieldRevenue")}
            type="number"
            value={editor.targets.targetMonthlyRevenue}
            onChange={(e) => setTargetField("targetMonthlyRevenue", e.target.value)}
          />
          <Field
            label={l("profit.targets.fieldMargin")}
            type="number"
            value={editor.targets.targetMonthlyMargin}
            onChange={(e) => setTargetField("targetMonthlyMargin", e.target.value)}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.targets.fieldMarginPercent")}
            type="number"
            value={editor.targets.targetMarginPercent}
            onChange={(e) => setTargetField("targetMarginPercent", e.target.value)}
          />
          <div />
        </FormRow>

        {anyTargetSet ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <TargetBadge
              label={l("profit.targets.fieldRevenue")}
              actualText={eur.format(liveResult.monthly.revenue)}
              targetText={
                targets.targetMonthlyRevenue != null
                  ? eur.format(targets.targetMonthlyRevenue)
                  : null
              }
              deltaText={
                targets.targetMonthlyRevenue != null
                  ? eur.format(checks.monthlyRevenue.delta)
                  : null
              }
              level={checks.monthlyRevenue.level}
            />
            <TargetBadge
              label={l("profit.targets.fieldMargin")}
              actualText={eur.format(liveResult.monthly.margin)}
              targetText={
                targets.targetMonthlyMargin != null
                  ? eur.format(targets.targetMonthlyMargin)
                  : null
              }
              deltaText={
                targets.targetMonthlyMargin != null
                  ? eur.format(checks.monthlyMargin.delta)
                  : null
              }
              level={checks.monthlyMargin.level}
            />
            <TargetBadge
              label={l("profit.targets.fieldMarginPercent")}
              actualText={percent.format(liveResult.marginPercent / 100)}
              targetText={
                targets.targetMarginPercent != null
                  ? percent.format(targets.targetMarginPercent / 100)
                  : null
              }
              deltaText={
                targets.targetMarginPercent != null
                  ? percent.format(checks.marginPercent.delta / 100)
                  : null
              }
              level={checks.marginPercent.level}
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500">{l("profit.targets.noneSet")}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={!canEdit || submitting || !editor.id}
            onClick={() => void onSave()}
          >
            {submitting ? l("profit.editor.savePending") : l("profit.targets.action.save")}
          </PrimaryButton>
          <SecondaryButton onClick={onClear}>
            {l("profit.targets.action.clear")}
          </SecondaryButton>
        </div>
      </div>
    </SectionCard>
  );
}

function TargetBadge({
  label,
  actualText,
  targetText,
  deltaText,
  level,
}: {
  label: string;
  actualText: string;
  targetText: string | null;
  deltaText: string | null;
  level: "ok" | "warn" | "fail" | "none";
}) {
  const { t: l } = useI18n();
  const tone =
    level === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : level === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        : level === "fail"
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          : "border-black/10 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400";
  const statusLabel =
    level === "ok"
      ? l("profit.targets.statusOk")
      : level === "warn"
        ? l("profit.targets.statusWarn")
        : level === "fail"
          ? l("profit.targets.statusFail")
          : "—";
  return (
    <div className={cx("rounded-xl border p-3 text-sm", tone)}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-mono font-semibold">{actualText}</div>
      {targetText ? (
        <div className="mt-1 text-xs">
          {l("profit.compare.metric")}: {targetText}
          {deltaText ? (
            <>
              {" · "}
              {l("profit.targets.delta")}: {deltaText}
            </>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1 text-xs font-semibold">{statusLabel}</div>
    </div>
  );
}

function BreakEvenPanel({
  inputs,
  eur,
  eurDetail,
  percent,
}: {
  inputs: PlanningInputs;
  eur: Intl.NumberFormat;
  eurDetail: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  const be = breakEven(inputs);
  const tone =
    be.status === "profitable"
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5"
      : be.status === "breakeven"
        ? "border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5"
        : "border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/5";
  const revenuePerWorkerWeek =
    inputs.regularHoursPerWorkerWeek * inputs.regularRatePerHour +
    inputs.overtimeHoursPerWorkerWeek * inputs.overtimeRatePerHour;
  const perWorkerMarginPercent =
    revenuePerWorkerWeek > 0
      ? (be.perWorkerWeeklyMargin / revenuePerWorkerWeek) * 100
      : 0;
  return (
    <SectionCard
      title={l("profit.breakEven.heading")}
      subtitle={l("profit.breakEven.formulaHint")}
    >
      <div className={cx("grid gap-2 rounded-2xl border p-3", tone)}>
        <div className="text-xs font-semibold uppercase tracking-wider">
          {be.status === "profitable"
            ? l("profit.breakEven.statusProfitable")
            : be.status === "breakeven"
              ? l("profit.breakEven.statusBreakeven")
              : l("profit.breakEven.statusUnreachable")}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <FinancialKpi
            label={l("profit.breakEven.perWorkerMargin")}
            value={`${eurDetail.format(be.perWorkerWeeklyMargin)} (${percent.format(perWorkerMarginPercent / 100)})`}
            highlight={be.perWorkerWeeklyMargin >= 0}
            warn={be.perWorkerWeeklyMargin < 0}
          />
          <FinancialKpi
            label={l("profit.breakEven.requiredRate")}
            value={
              be.requiredRegularRate != null
                ? eurDetail.format(be.requiredRegularRate)
                : "—"
            }
          />
          <FinancialKpi
            label={l("profit.breakEven.maxCost")}
            value={eur.format(be.maxCostPerWorkerWeek)}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function SensitivityPanel({
  inputs,
  eur,
  percent,
}: {
  inputs: PlanningInputs;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  const [variable, setVariable] = useState<SensitivityVariable>("teamsPerWeek");
  const [minStr, setMinStr] = useState("0");
  const [maxStr, setMaxStr] = useState("8");
  const [stepsStr, setStepsStr] = useState("8");

  const min = Number.parseFloat(minStr.replace(",", ".")) || 0;
  const max = Number.parseFloat(maxStr.replace(",", ".")) || min + 1;
  const steps = Math.max(2, Math.min(20, Math.floor(Number.parseInt(stepsStr, 10) || 8)));
  const result = sensitivity(inputs, variable, { min, max, steps });

  function applyDefaultRange(nextVar: SensitivityVariable) {
    setVariable(nextVar);
    const base = inputs[nextVar] ?? 0;
    const nMin = Math.max(0, base * 0.5);
    const nMax = Math.max(nMin + 1, base * 1.5);
    setMinStr(nMin.toFixed(2));
    setMaxStr(nMax.toFixed(2));
  }

  const fmtVar = (n: number) => {
    if (variable === "teamsPerWeek") return n.toFixed(0);
    return eur.format(n);
  };

  return (
    <SectionCard
      title={l("profit.sensitivity.heading")}
      subtitle={l("profit.sensitivity.subtitle")}
    >
      <div className="grid gap-3">
        <FormRow>
          <SelectField
            label={l("profit.sensitivity.variable")}
            value={variable}
            onChange={(e) => applyDefaultRange(e.target.value as SensitivityVariable)}
            options={[
              { value: "teamsPerWeek", label: l("profit.sensitivity.var.teamsPerWeek") },
              { value: "regularRatePerHour", label: l("profit.sensitivity.var.regularRatePerHour") },
              { value: "costPerWorkerWeek", label: l("profit.sensitivity.var.costPerWorkerWeek") },
            ]}
          />
          <Field
            label={l("profit.sensitivity.steps")}
            type="number"
            value={stepsStr}
            onChange={(e) => setStepsStr(e.target.value)}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.sensitivity.min")}
            type="number"
            value={minStr}
            onChange={(e) => setMinStr(e.target.value)}
          />
          <Field
            label={l("profit.sensitivity.max")}
            type="number"
            value={maxStr}
            onChange={(e) => setMaxStr(e.target.value)}
          />
        </FormRow>

        <div className="grid gap-2 sm:grid-cols-2">
          <FinancialKpi
            label={l("profit.sensitivity.bestCase")}
            value={`${fmtVar(result.best.variableValue)} → ${eur.format(result.best.monthlyMargin)}`}
            highlight={result.best.monthlyMargin >= 0}
            warn={result.best.monthlyMargin < 0}
          />
          <FinancialKpi
            label={l("profit.sensitivity.worstCase")}
            value={`${fmtVar(result.worst.variableValue)} → ${eur.format(result.worst.monthlyMargin)}`}
            highlight={result.worst.monthlyMargin >= 0}
            warn={result.worst.monthlyMargin < 0}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.sensitivity.tableValue")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.sensitivity.tableWeeklyMargin")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.sensitivity.tableMonthlyMargin")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.sensitivity.tableMarginPercent")}</th>
              </tr>
            </thead>
            <tbody>
              {result.points.map((p, i) => (
                <tr key={i} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="py-1 pr-3 font-mono text-xs">{fmtVar(p.variableValue)}</td>
                  <td className="py-1 pr-3 text-right font-mono text-xs">{eur.format(p.weeklyMargin)}</td>
                  <td
                    className={cx(
                      "py-1 pr-3 text-right font-mono text-xs",
                      p.monthlyMargin >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-red-700 dark:text-red-400",
                    )}
                  >
                    {eur.format(p.monthlyMargin)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono text-xs">
                    {percent.format(p.marginPercent / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Phase 4: Actuals / Plan-vs-Ist / Forecast / Versionen ──────

type ActualDraft = {
  year: string;
  month: string;
  actualRevenue: string;
  actualCost: string;
  actualHours: string;
  actualOvertimeHours: string;
  note: string;
};

function emptyActualDraft(): ActualDraft {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    actualRevenue: "",
    actualCost: "",
    actualHours: "",
    actualOvertimeHours: "",
    note: "",
  };
}

function parseOptionalNumber(value: string): number | undefined {
  const t = value.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function ActualsPanel({
  apiFetch,
  canEdit,
  eur,
  flashSuccess,
  setError,
  refreshNonce,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  canEdit: boolean;
  eur: Intl.NumberFormat;
  flashSuccess: (message: string) => void;
  setError: (msg: string | null) => void;
  refreshNonce: number;
}) {
  const { t: l } = useI18n();
  const [actuals, setActuals] = useState<PlanningActualApi[] | null>(null);
  const [draft, setDraft] = useState<ActualDraft>(emptyActualDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<PlanningActualApi[]>("/planning/actuals");
      setActuals(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/403|forbidden|verweigert|denied/i.test(msg)) {
        setActuals([]);
      } else {
        setError(msg || l("common.error"));
      }
    }
  }, [apiFetch, l, setError]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  function startEdit(a: PlanningActualApi) {
    setEditingId(a.id);
    setDraft({
      year: String(a.year),
      month: String(a.month),
      actualRevenue: String(a.actualRevenue),
      actualCost: String(a.actualCost),
      actualHours: a.actualHours != null ? String(a.actualHours) : "",
      actualOvertimeHours:
        a.actualOvertimeHours != null ? String(a.actualOvertimeHours) : "",
      note: a.note ?? "",
    });
  }

  function resetDraft() {
    setEditingId(null);
    setDraft(emptyActualDraft());
  }

  async function submit() {
    if (!canEdit) return;
    setSubmitting(true);
    setError(null);
    try {
      const year = Number.parseInt(draft.year, 10);
      const month = Number.parseInt(draft.month, 10);
      const actualRevenue = Number.parseFloat(draft.actualRevenue.replace(",", "."));
      const actualCost = Number.parseFloat(draft.actualCost.replace(",", "."));
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(actualRevenue) ||
        !Number.isFinite(actualCost)
      ) {
        setError(l("common.error"));
        return;
      }
      const payload: Record<string, unknown> = {
        year,
        month,
        actualRevenue,
        actualCost,
      };
      const hours = parseOptionalNumber(draft.actualHours);
      if (hours != null) payload.actualHours = hours;
      const ot = parseOptionalNumber(draft.actualOvertimeHours);
      if (ot != null) payload.actualOvertimeHours = ot;
      const note = draft.note.trim();
      if (note) payload.note = note;
      if (editingId) {
        await apiFetch(`/planning/actuals/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.actuals.updated"));
      } else {
        await apiFetch("/planning/actuals", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.actuals.created"));
      }
      resetDraft();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!canEdit) return;
    if (typeof window !== "undefined" && !window.confirm(l("profit.actuals.confirmDelete"))) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/planning/actuals/${id}`, { method: "DELETE" });
      flashSuccess(l("profit.actuals.deleted"));
      if (editingId === id) resetDraft();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  const sorted = useMemo(() => {
    if (!actuals) return [];
    return [...actuals].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [actuals]);

  return (
    <SectionCard
      title={l("profit.actuals.heading")}
      subtitle={l("profit.actuals.subtitle")}
    >
      {!canEdit ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {l("profit.actuals.requiresPermission")}
        </p>
      ) : null}

      <div className="grid gap-3">
        <FormRow>
          <Field
            label={l("profit.actuals.fieldYear")}
            type="number"
            value={draft.year}
            onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))}
          />
          <Field
            label={l("profit.actuals.fieldMonth")}
            type="number"
            value={draft.month}
            onChange={(e) => setDraft((d) => ({ ...d, month: e.target.value }))}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.actuals.fieldRevenue")}
            type="number"
            value={draft.actualRevenue}
            onChange={(e) =>
              setDraft((d) => ({ ...d, actualRevenue: e.target.value }))
            }
          />
          <Field
            label={l("profit.actuals.fieldCost")}
            type="number"
            value={draft.actualCost}
            onChange={(e) =>
              setDraft((d) => ({ ...d, actualCost: e.target.value }))
            }
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.actuals.fieldHours")}
            type="number"
            value={draft.actualHours}
            onChange={(e) =>
              setDraft((d) => ({ ...d, actualHours: e.target.value }))
            }
          />
          <Field
            label={l("profit.actuals.fieldOvertimeHours")}
            type="number"
            value={draft.actualOvertimeHours}
            onChange={(e) =>
              setDraft((d) => ({ ...d, actualOvertimeHours: e.target.value }))
            }
          />
        </FormRow>
        <TextArea
          label={l("profit.actuals.fieldNote")}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
        />
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={!canEdit || submitting}
            onClick={() => void submit()}
          >
            {editingId
              ? l("profit.actuals.action.update")
              : l("profit.actuals.action.add")}
          </PrimaryButton>
          {editingId ? (
            <SecondaryButton onClick={resetDraft}>
              {l("profit.editor.action.discard")}
            </SecondaryButton>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-500">{l("profit.actuals.empty")}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="py-2 pr-3">{l("profit.pvi.colMonth")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.actuals.fieldRevenue")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.actuals.fieldCost")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.kpi.margin")}</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => {
                  const margin = a.actualRevenue - a.actualCost;
                  const positive = margin >= 0;
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className="py-1 pr-3 font-mono text-xs">
                        {a.year}-{String(a.month).padStart(2, "0")}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono text-xs">
                        {eur.format(a.actualRevenue)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono text-xs">
                        {eur.format(a.actualCost)}
                      </td>
                      <td
                        className={cx(
                          "py-1 pr-3 text-right font-mono text-xs",
                          positive
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-700 dark:text-red-400",
                        )}
                      >
                        {eur.format(margin)}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(a)}
                            disabled={!canEdit}
                            className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-slate-800"
                          >
                            {l("profit.actuals.action.update")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(a.id)}
                            disabled={!canEdit || submitting}
                            className="rounded-lg border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400"
                          >
                            {l("profit.actuals.action.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function PlanVsActualPanel({
  apiFetch,
  scenarioId,
  eur,
  percent,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenarioId: string;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  const [range, setRange] = useState<"3" | "6" | "12">("6");
  const [data, setData] = useState<PlanVsActualResponse | null>(null);
  const [error, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const months = Number.parseInt(range, 10);
    const now = new Date();
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const fromDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
    apiFetch<PlanVsActualResponse>(
      `/planning/scenarios/${scenarioId}/plan-vs-actual?from=${from}&to=${to}`,
    )
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLocalError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        if (/403|forbidden|verweigert|denied/i.test(msg)) {
          setLocalError(l("profit.pvi.requiresPermission"));
        } else {
          setLocalError(msg || l("common.error"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, scenarioId, range, l]);

  const rows = data?.rows ?? [];

  return (
    <SectionCard
      title={l("profit.pvi.heading")}
      subtitle={l("profit.pvi.subtitle")}
    >
      <div className="mb-3">
        <SelectField
          label={l("profit.kpi.monthly")}
          value={range}
          onChange={(e) => setRange(e.target.value as "3" | "6" | "12")}
          options={[
            { value: "3", label: l("profit.pvi.range3") },
            { value: "6", label: l("profit.pvi.range6") },
            { value: "12", label: l("profit.pvi.range12") },
          ]}
        />
      </div>
      {error ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{error}</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.pvi.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.pvi.colMonth")}</th>
                <th className="py-2 pr-3 text-right">
                  {l("profit.pvi.colPlan")} · {l("profit.kpi.revenue")}
                </th>
                <th className="py-2 pr-3 text-right">
                  {l("profit.pvi.colActual")} · {l("profit.kpi.revenue")}
                </th>
                <th className="py-2 pr-3 text-right">
                  {l("profit.pvi.colDelta")} · {l("profit.kpi.revenue")}
                </th>
                <th className="py-2 pr-3 text-right">
                  {l("profit.pvi.colPlan")} · {l("profit.kpi.margin")}
                </th>
                <th className="py-2 pr-3 text-right">
                  {l("profit.pvi.colActual")} · {l("profit.kpi.margin")}
                </th>
                <th className="py-2 pr-3 text-right">
                  {l("profit.pvi.colDelta")} · {l("profit.kpi.margin")}
                </th>
                <th className="py-2 pr-3 text-right">{l("profit.pvi.colDeltaPercent")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = `${r.year}-${r.month}`;
                const ymLabel = `${r.year}-${String(r.month).padStart(2, "0")}`;
                const positiveMargin =
                  r.deltaMargin != null ? r.deltaMargin >= 0 : null;
                return (
                  <tr
                    key={key}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 font-mono text-xs">{ymLabel}</td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(r.planRevenue)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {r.actualRevenue != null ? eur.format(r.actualRevenue) : "—"}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {r.deltaRevenue != null ? eur.format(r.deltaRevenue) : "—"}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(r.planMargin)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {r.actualMargin != null ? eur.format(r.actualMargin) : "—"}
                    </td>
                    <td
                      className={cx(
                        "py-1 pr-3 text-right font-mono text-xs",
                        positiveMargin == null
                          ? ""
                          : positiveMargin
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-700 dark:text-red-400",
                      )}
                    >
                      {r.deltaMargin != null ? eur.format(r.deltaMargin) : "—"}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {r.deltaMarginPercent != null
                        ? percent.format(r.deltaMarginPercent / 100)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function ForecastPanel({
  apiFetch,
  scenarioId,
  eur,
  percent,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenarioId: string;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  const [mode, setMode] = useState<"plan" | "trend">("plan");
  const [months, setMonths] = useState<"3" | "6">("6");
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [error, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ForecastResponse>(
      `/planning/scenarios/${scenarioId}/forecast?mode=${mode}&months=${months}`,
    )
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLocalError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        if (/403|forbidden|verweigert|denied/i.test(msg)) {
          setLocalError(l("profit.pvi.requiresPermission"));
        } else {
          setLocalError(msg || l("common.error"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, scenarioId, mode, months, l]);

  return (
    <SectionCard
      title={l("profit.forecast.heading")}
      subtitle={l("profit.forecast.subtitle")}
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <SelectField
          label={l("profit.forecast.modeLabel")}
          value={mode}
          onChange={(e) => setMode(e.target.value as "plan" | "trend")}
          options={[
            { value: "plan", label: l("profit.forecast.modePlan") },
            { value: "trend", label: l("profit.forecast.modeTrend") },
          ]}
        />
        <SelectField
          label={l("profit.forecast.monthsLabel")}
          value={months}
          onChange={(e) => setMonths(e.target.value as "3" | "6")}
          options={[
            { value: "3", label: "3" },
            { value: "6", label: "6" },
          ]}
        />
      </div>
      {error ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{error}</p>
      ) : null}
      <p className="mb-2 text-xs text-slate-500">{l("profit.forecast.simplifiedHint")}</p>
      {mode === "trend" ? (
        data?.basis ? (
          <p className="mb-3 text-xs text-slate-500">
            {l("profit.forecast.basis")}: {eur.format(data.basis.revenue)} ·{" "}
            {eur.format(data.basis.cost)}
          </p>
        ) : (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
            {l("profit.forecast.noBasis")}
          </p>
        )
      ) : null}
      {!data || data.points.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.pvi.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.pvi.colMonth")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.kpi.revenue")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.kpi.cost")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.kpi.margin")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.kpi.marginPercent")}</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => {
                const positive = p.margin >= 0;
                return (
                  <tr
                    key={`${p.year}-${p.month}`}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 font-mono text-xs">
                      {p.year}-{String(p.month).padStart(2, "0")}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(p.revenue)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(p.cost)}
                    </td>
                    <td
                      className={cx(
                        "py-1 pr-3 text-right font-mono text-xs",
                        positive
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400",
                      )}
                    >
                      {eur.format(p.margin)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {percent.format(p.marginPercent / 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function VersionsPanel({
  apiFetch,
  scenarioId,
  canManage,
  dateTime,
  flashSuccess,
  setError,
  onRestored,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenarioId: string;
  canManage: boolean;
  dateTime: Intl.DateTimeFormat;
  flashSuccess: (message: string) => void;
  setError: (msg: string | null) => void;
  onRestored: () => Promise<void> | void;
}) {
  const { t: l } = useI18n();
  const [versions, setVersions] = useState<PlanningVersionApi[] | null>(null);
  const [snapshotOpenId, setSnapshotOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<PlanningVersionApi[]>(
        `/planning/scenarios/${scenarioId}/versions`,
      );
      setVersions(list);
      setPermissionDenied(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/403|forbidden|verweigert|denied/i.test(msg)) {
        setPermissionDenied(true);
        setVersions([]);
      } else {
        setError(msg || l("common.error"));
      }
    }
  }, [apiFetch, scenarioId, l, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(versionId: string) {
    if (!canManage) return;
    if (typeof window !== "undefined" && !window.confirm(l("profit.versions.confirmRestore"))) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/planning/scenarios/${scenarioId}/versions/${versionId}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      flashSuccess(l("profit.versions.restored"));
      await load();
      await onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  const snapshot = useMemo(() => {
    if (!snapshotOpenId || !versions) return null;
    return versions.find((v) => v.id === snapshotOpenId) ?? null;
  }, [snapshotOpenId, versions]);

  return (
    <SectionCard
      title={l("profit.versions.heading")}
      subtitle={l("profit.versions.subtitle")}
    >
      {permissionDenied || !canManage ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {l("profit.versions.requiresPermission")}
        </p>
      ) : null}
      {versions == null ? (
        <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.versions.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.versions.colVersion")}</th>
                <th className="py-2 pr-3">{l("profit.versions.colChangedAt")}</th>
                <th className="py-2 pr-3">{l("profit.versions.colChangedBy")}</th>
                <th className="py-2 pr-3">{l("profit.versions.colNote")}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1 pr-3 font-mono text-xs">v{v.versionNumber}</td>
                  <td className="py-1 pr-3 text-xs">
                    {dateTime.format(new Date(v.changedAt))}
                  </td>
                  <td className="py-1 pr-3 text-xs">
                    {v.changedBy?.displayName ?? "—"}
                  </td>
                  <td className="py-1 pr-3 text-xs text-slate-500">
                    {v.changeNote ?? "—"}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setSnapshotOpenId((prev) => (prev === v.id ? null : v.id))
                        }
                        className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
                      >
                        {l("profit.versions.action.view")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void restore(v.id)}
                        disabled={!canManage || submitting}
                        className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-40 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                      >
                        {l("profit.versions.action.restore")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {snapshot ? (
        <div className="mt-3 rounded-2xl border border-black/10 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-950/40">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {l("profit.versions.snapshotHeading")} · v{snapshot.versionNumber}
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-slate-700 dark:text-slate-300">
            {JSON.stringify(snapshot.snapshotJson, null, 2)}
          </pre>
        </div>
      ) : null}
    </SectionCard>
  );
}

// ── Phase 5: CSV-Import Wizard + Historie ─────────────────────

type ImportStep = "choose" | "preview" | "done";

function ImportPanel({
  apiFetch,
  eur,
  flashSuccess,
  setError,
  onImported,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  eur: Intl.NumberFormat;
  flashSuccess: (message: string) => void;
  setError: (msg: string | null) => void;
  onImported: () => void;
}) {
  const { t: l } = useI18n();
  const [step, setStep] = useState<ImportStep>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<DuplicateStrategy>("skip");
  const [submitting, setSubmitting] = useState(false);
  const [dryRun, setDryRun] = useState<ImportDryRunResponse | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(
    null,
  );

  function reset() {
    setStep("choose");
    setFile(null);
    setStrategy("skip");
    setDryRun(null);
    setCommitResult(null);
  }

  async function runDryRun() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("duplicateStrategy", strategy);
      const result = await apiFetch<ImportDryRunResponse>(
        "/planning/actuals/import/dry-run",
        { method: "POST", body: formData, headers: {} },
      );
      setDryRun(result);
      setStep("preview");
      flashSuccess(l("profit.import.dryRun.success"));
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function runCommit() {
    if (!file) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(l("profit.import.commit.confirm"))
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("duplicateStrategy", strategy);
      const result = await apiFetch<ImportCommitResponse>(
        "/planning/actuals/import/commit",
        { method: "POST", body: formData, headers: {} },
      );
      setCommitResult(result);
      setStep("done");
      onImported();
      const messageKey =
        result.status === "succeeded"
          ? "profit.import.commit.success"
          : result.status === "partial"
            ? "profit.import.commit.partial"
            : "profit.import.commit.failed";
      flashSuccess(l(messageKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.import.heading")}
      subtitle={l("profit.import.subtitle")}
    >
      <ImportSteps active={step} />

      {step === "choose" ? (
        <div className="grid gap-3">
          <p className="text-xs text-slate-500">{l("profit.import.formatHint")}</p>
          <div className="grid gap-2">
            <label className="text-sm font-medium">
              {l("profit.import.fieldFile")}
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900"
            />
            {file ? (
              <span className="text-xs text-slate-500">
                {file.name} · {Math.round(file.size / 1024)} KB
              </span>
            ) : null}
          </div>
          <SelectField
            label={l("profit.import.fieldStrategy")}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as DuplicateStrategy)}
            options={[
              { value: "skip", label: l("profit.import.strategy.skip") },
              {
                value: "overwrite",
                label: l("profit.import.strategy.overwrite"),
              },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              disabled={!file || submitting}
              onClick={() => void runDryRun()}
            >
              {l("profit.import.action.dryRun")}
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {step === "preview" && dryRun ? (
        <ImportPreview
          dryRun={dryRun}
          eur={eur}
          submitting={submitting}
          onCommit={() => void runCommit()}
          onCancel={reset}
        />
      ) : null}

      {step === "done" && commitResult ? (
        <ImportDoneView
          commit={commitResult}
          onRestart={reset}
        />
      ) : null}
    </SectionCard>
  );
}

function ImportSteps({ active }: { active: ImportStep }) {
  const { t: l } = useI18n();
  const items: { key: ImportStep; label: string }[] = [
    { key: "choose", label: l("profit.import.step.choose") },
    { key: "preview", label: l("profit.import.step.preview") },
    { key: "done", label: l("profit.import.step.done") },
  ];
  return (
    <ol className="mb-3 flex flex-wrap gap-2 text-xs">
      {items.map((it) => (
        <li
          key={it.key}
          className={cx(
            "rounded-full border px-3 py-1",
            it.key === active
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
              : "border-black/10 bg-white text-slate-500 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400",
          )}
        >
          {it.label}
        </li>
      ))}
    </ol>
  );
}

function ImportPreview({
  dryRun,
  eur,
  submitting,
  onCommit,
  onCancel,
}: {
  dryRun: ImportDryRunResponse;
  eur: Intl.NumberFormat;
  submitting: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t: l } = useI18n();
  const previewRows = dryRun.rows.slice(0, 200);
  const more = dryRun.rows.length - previewRows.length;
  const errors = dryRun.errorReport.slice(0, 200);
  const moreErrors = dryRun.errorReport.length - errors.length;
  const canCommit =
    dryRun.summary.toCreate + dryRun.summary.toOverwrite > 0 && !submitting;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <SummaryCell
          label={l("profit.import.summary.toCreate")}
          value={dryRun.summary.toCreate}
          tone="ok"
        />
        <SummaryCell
          label={l("profit.import.summary.toOverwrite")}
          value={dryRun.summary.toOverwrite}
          tone="warn"
        />
        <SummaryCell
          label={l("profit.import.summary.toSkip")}
          value={dryRun.summary.toSkip}
          tone="neutral"
        />
        <SummaryCell
          label={l("profit.import.summary.errors")}
          value={dryRun.summary.errors}
          tone={dryRun.summary.errors > 0 ? "fail" : "neutral"}
        />
      </div>

      {previewRows.length > 0 ? (
        <div className="overflow-x-auto">
          <h4 className="mb-2 text-sm font-semibold">
            {l("profit.import.preview.heading")}
          </h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.import.preview.colRow")}</th>
                <th className="py-2 pr-3">{l("profit.import.preview.colMonth")}</th>
                <th className="py-2 pr-3">{l("profit.import.preview.colAction")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.import.preview.colRevenue")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.import.preview.colCost")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.import.preview.colExisting")}</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r) => {
                const ymLabel = `${r.candidate.year}-${String(r.candidate.month).padStart(2, "0")}`;
                const actionLabel =
                  r.action === "create"
                    ? l("profit.import.preview.actionCreate")
                    : r.action === "overwrite"
                      ? l("profit.import.preview.actionOverwrite")
                      : l("profit.import.preview.actionSkip");
                const tone =
                  r.action === "create"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : r.action === "overwrite"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-slate-500";
                return (
                  <tr
                    key={r.rowNumber}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 font-mono text-xs">{r.rowNumber}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{ymLabel}</td>
                    <td className={cx("py-1 pr-3 text-xs", tone)}>{actionLabel}</td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(r.candidate.actualRevenue)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(r.candidate.actualCost)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {r.existing
                        ? `${eur.format(r.existing.actualRevenue)} / ${eur.format(r.existing.actualCost)}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {more > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              … +{more}
            </p>
          ) : null}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="overflow-x-auto">
          <h4 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
            {l("profit.import.errors.heading")}
          </h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.import.errors.colRow")}</th>
                <th className="py-2 pr-3">{l("profit.import.errors.colCode")}</th>
                <th className="py-2 pr-3">{l("profit.import.errors.colMessage")}</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, idx) => (
                <tr
                  key={`${e.rowNumber}-${idx}`}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1 pr-3 font-mono text-xs">{e.rowNumber}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{e.code}</td>
                  <td className="py-1 pr-3 text-xs text-red-700 dark:text-red-400">
                    {e.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {moreErrors > 0 ? (
            <p className="mt-1 text-xs text-slate-500">… +{moreErrors}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          disabled={!canCommit}
          onClick={onCommit}
        >
          {l("profit.import.action.commit")}
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>
          {l("profit.import.action.cancel")}
        </SecondaryButton>
      </div>
    </div>
  );
}

function ImportDoneView({
  commit,
  onRestart,
}: {
  commit: ImportCommitResponse;
  onRestart: () => void;
}) {
  const { t: l } = useI18n();
  const tone =
    commit.status === "succeeded"
      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10"
      : commit.status === "partial"
        ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10"
        : "border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10";
  return (
    <div className="grid gap-3">
      <div className={cx("rounded-2xl border p-3", tone)}>
        <div className="text-sm font-semibold">
          {commit.status === "succeeded"
            ? l("profit.import.commit.success")
            : commit.status === "partial"
              ? l("profit.import.commit.partial")
              : l("profit.import.commit.failed")}
        </div>
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
          <div>
            <div className="opacity-60">{l("profit.import.summary.created")}</div>
            <div className="font-mono">{commit.summary.created}</div>
          </div>
          <div>
            <div className="opacity-60">{l("profit.import.summary.overwritten")}</div>
            <div className="font-mono">{commit.summary.overwritten}</div>
          </div>
          <div>
            <div className="opacity-60">{l("profit.import.summary.skipped")}</div>
            <div className="font-mono">{commit.summary.skipped}</div>
          </div>
          <div>
            <div className="opacity-60">{l("profit.import.summary.errors")}</div>
            <div className="font-mono">{commit.summary.errors}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <SecondaryButton onClick={onRestart}>
          {l("profit.import.action.restart")}
        </SecondaryButton>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "fail" | "neutral";
}) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        : tone === "fail"
          ? "border-red-200 bg-red-50/60 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          : "border-black/10 bg-slate-50/60 text-slate-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400";
  return (
    <div className={cx("rounded-xl border p-3 text-sm", styles)}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function ImportHistoryPanel({
  apiFetch,
  authToken,
  dateTime,
  refreshNonce,
  setError,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  authToken?: string;
  dateTime: Intl.DateTimeFormat;
  refreshNonce: number;
  setError: (msg: string | null) => void;
}) {
  const { t: l } = useI18n();
  const [jobs, setJobs] = useState<PlanningImportJobApi[] | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<PlanningImportJobDetail | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<PlanningImportJobApi[]>(
        "/planning/import-jobs",
      );
      setJobs(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, l, setError]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const loadDetail = useCallback(
    async (jobId: string) => {
      try {
        const d = await apiFetch<PlanningImportJobDetail>(
          `/planning/import-jobs/${jobId}`,
        );
        setOpenJob(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : l("common.error"));
      }
    },
    [apiFetch, l, setError],
  );

  useEffect(() => {
    if (!openJobId) {
      setOpenJob(null);
      return;
    }
    void loadDetail(openJobId);
  }, [openJobId, loadDetail]);

  async function downloadErrors(jobId: string) {
    try {
      const response = await fetch(
        apiUrl(`/planning/import-jobs/${jobId}/errors.csv`),
        {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `planning-import-${jobId}-errors.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }

  return (
    <SectionCard
      title={l("profit.import.history.heading")}
      subtitle={l("profit.import.history.subtitle")}
    >
      {jobs == null ? (
        <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.import.history.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.import.history.colStartedAt")}</th>
                <th className="py-2 pr-3">{l("profit.import.history.colMode")}</th>
                <th className="py-2 pr-3">{l("profit.import.history.colStatus")}</th>
                <th className="py-2 pr-3">{l("profit.import.history.colFile")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.import.history.colTotal")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.import.history.colSuccess")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.import.history.colSkipped")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.import.history.colErrors")}</th>
                <th className="py-2 pr-3">{l("profit.import.history.colUser")}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const modeLabel =
                  j.mode === "dry-run"
                    ? l("profit.import.history.modeDryRun")
                    : l("profit.import.history.modeCommit");
                const statusLabel =
                  j.status === "succeeded"
                    ? l("profit.import.history.statusSucceeded")
                    : j.status === "partial"
                      ? l("profit.import.history.statusPartial")
                      : l("profit.import.history.statusFailed");
                const statusTone =
                  j.status === "succeeded"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : j.status === "partial"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-red-700 dark:text-red-400";
                return (
                  <tr
                    key={j.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 text-xs">
                      {dateTime.format(new Date(j.startedAt))}
                    </td>
                    <td className="py-1 pr-3 text-xs">{modeLabel}</td>
                    <td className={cx("py-1 pr-3 text-xs font-medium", statusTone)}>
                      {statusLabel}
                    </td>
                    <td className="py-1 pr-3 text-xs">{j.filename ?? "—"}</td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">{j.totalRows}</td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">{j.successRows}</td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">{j.skippedRows}</td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">{j.errorRows}</td>
                    <td className="py-1 pr-3 text-xs">{j.createdBy?.displayName ?? "—"}</td>
                    <td className="py-1 pr-3 text-right">
                      <div className="flex justify-end gap-1">
                        {j.errorRows > 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenJobId((prev) => (prev === j.id ? null : j.id))
                              }
                              className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
                            >
                              {l("profit.import.history.action.viewErrors")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void downloadErrors(j.id)}
                              className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
                            >
                              {l("profit.import.history.action.downloadErrors")}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openJob && openJob.errorReport.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-black/10 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-950/40">
          <h4 className="mb-2 text-sm font-semibold">
            {l("profit.import.errors.heading")} · {openJob.filename ?? openJob.id}
          </h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.import.errors.colRow")}</th>
                <th className="py-2 pr-3">{l("profit.import.errors.colCode")}</th>
                <th className="py-2 pr-3">{l("profit.import.errors.colMessage")}</th>
              </tr>
            </thead>
            <tbody>
              {openJob.errorReport.slice(0, 200).map((e, idx) => (
                <tr
                  key={`${e.rowNumber}-${idx}`}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1 pr-3 font-mono text-xs">{e.rowNumber}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{e.code}</td>
                  <td className="py-1 pr-3 text-xs text-red-700 dark:text-red-400">
                    {e.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </SectionCard>
  );
}

// ── Phase 6: KPI-Dashboard + Alerts ────────────────────────────

function KpiDashboardPanel({
  apiFetch,
  eur,
  percent,
  refreshNonce,
  setError,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  refreshNonce: number;
  setError: (msg: string | null) => void;
}) {
  const { t: l } = useI18n();
  const [range, setRange] = useState<"6m" | "12m">("6m");
  const [data, setData] = useState<KpiDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<KpiDashboard>(`/planning/kpis?range=${range}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : l("common.error"));
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, range, refreshNonce, l, setError]);

  if (!data) {
    return (
      <SectionCard title={l("profit.kpi.heading")} subtitle={l("profit.kpi.subtitle")}>
        <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
      </SectionCard>
    );
  }
  if (!data.scenarioId) {
    return (
      <SectionCard title={l("profit.kpi.heading")} subtitle={l("profit.kpi.subtitle")}>
        <p className="text-sm text-slate-500">{l("profit.kpi.noScenario")}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={l("profit.kpi.heading")}
      subtitle={`${l("profit.kpi.scenario")}: ${data.scenarioName ?? "—"}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <SelectField
          label={l("profit.kpi.trendHeading")}
          value={range}
          onChange={(e) => setRange(e.target.value as "6m" | "12m")}
          options={[
            { value: "6m", label: l("profit.kpi.range6m") },
            { value: "12m", label: l("profit.kpi.range12m") },
          ]}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <FinancialKpi
          label={l("profit.kpi.actualRevenue")}
          value={
            data.currentMonth ? eur.format(data.currentMonth.revenue) : "—"
          }
        />
        <FinancialKpi
          label={l("profit.kpi.actualCost")}
          value={data.currentMonth ? eur.format(data.currentMonth.cost) : "—"}
        />
        <FinancialKpi
          label={l("profit.kpi.actualMargin")}
          value={data.currentMonth ? eur.format(data.currentMonth.margin) : "—"}
          highlight={(data.currentMonth?.margin ?? 0) >= 0}
          warn={(data.currentMonth?.margin ?? 0) < 0}
        />
        <FinancialKpi
          label={l("profit.kpi.deltaMargin")}
          value={
            data.planVsActualLatest
              ? `${eur.format(data.planVsActualLatest.deltaMargin)}${
                  data.planVsActualLatest.deltaMarginPercent != null
                    ? ` (${percent.format(data.planVsActualLatest.deltaMarginPercent / 100)})`
                    : ""
                }`
              : "—"
          }
          highlight={(data.planVsActualLatest?.deltaMargin ?? 0) >= 0}
          warn={(data.planVsActualLatest?.deltaMargin ?? 0) < 0}
        />
        <FinancialKpi
          label={l("profit.kpi.forecastMargin3")}
          value={eur.format(data.forecastNext3.margin)}
          highlight={data.forecastNext3.margin >= 0}
          warn={data.forecastNext3.margin < 0}
        />
      </div>

      {data.currentMonth == null ? (
        <p className="mt-3 text-xs text-slate-500">{l("profit.kpi.noActuals")}</p>
      ) : null}

      {data.trend.length > 0 ? (
        <div className="mt-5 grid gap-4">
          <KpiTrendChart trend={data.trend} eur={eur} />
          <KpiHeatmap trend={data.trend} percent={percent} />
        </div>
      ) : null}
    </SectionCard>
  );
}

function KpiTrendChart({
  trend,
  eur,
}: {
  trend: KpiTrendPoint[];
  eur: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  // Einfaches SVG-Sparkline-Trio fuer Umsatz/Kosten/Marge — ohne externe
  // Charting-Lib, damit das Bundle leicht bleibt.
  const width = 600;
  const height = 120;
  const padding = 24;

  const allValues: number[] = [];
  for (const p of trend) {
    allValues.push(p.actualRevenue ?? p.planRevenue);
    allValues.push(p.actualCost ?? p.planCost);
    allValues.push(p.actualMargin ?? p.planMargin);
  }
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const span = Math.max(max - min, 1);

  const xStep = trend.length > 1 ? (width - padding * 2) / (trend.length - 1) : 0;
  const project = (v: number) =>
    height - padding - ((v - min) / span) * (height - padding * 2);

  function pathFor(getter: (p: KpiTrendPoint) => number | null) {
    let path = '';
    trend.forEach((p, i) => {
      const v = getter(p);
      if (v == null) return;
      const x = padding + i * xStep;
      const y = project(v);
      path += `${path ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    });
    return path.trim();
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{l("profit.kpi.trendHeading")}</h4>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line
          x1={padding}
          y1={project(0)}
          x2={width - padding}
          y2={project(0)}
          stroke="currentColor"
          strokeOpacity="0.15"
        />
        <path
          d={pathFor((p) => p.actualRevenue ?? p.planRevenue)}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
        />
        <path
          d={pathFor((p) => p.actualCost ?? p.planCost)}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
        />
        <path
          d={pathFor((p) => p.actualMargin ?? p.planMargin)}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
        />
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        <Legend color="#3b82f6" label={l("profit.kpi.revenue")} />
        <Legend color="#f97316" label={l("profit.kpi.cost")} />
        <Legend color="#10b981" label={l("profit.kpi.margin")} />
        <span className="ml-auto font-mono">
          min {eur.format(min)} · max {eur.format(max)}
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-2 w-3 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function KpiHeatmap({
  trend,
  percent,
}: {
  trend: KpiTrendPoint[];
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  // Map deltaMarginPercent to a color: <-25% red, 0% gray, >+25% green.
  function color(value: number | null): string {
    if (value == null) return "rgba(148,163,184,0.25)";
    const clamped = Math.max(-50, Math.min(50, value));
    if (clamped >= 0) {
      const intensity = Math.min(1, clamped / 25);
      return `rgba(16,185,129,${0.15 + 0.45 * intensity})`;
    }
    const intensity = Math.min(1, -clamped / 25);
    return `rgba(239,68,68,${0.15 + 0.45 * intensity})`;
  }
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{l("profit.kpi.heatmapHeading")}</h4>
      <div className="grid grid-flow-col auto-cols-fr gap-1">
        {trend.map((p) => (
          <div
            key={`${p.year}-${p.month}`}
            className="rounded border border-black/5 px-2 py-2 text-center text-xs dark:border-white/5"
            style={{ background: color(p.deltaMarginPercent) }}
            title={
              p.deltaMarginPercent != null
                ? `${p.year}-${String(p.month).padStart(2, "0")}: ${percent.format(p.deltaMarginPercent / 100)}`
                : `${p.year}-${String(p.month).padStart(2, "0")}: —`
            }
          >
            <div className="font-mono">{String(p.month).padStart(2, "0")}</div>
            <div className="font-mono opacity-60">{String(p.year).slice(-2)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{l("profit.kpi.heatmapHint")}</p>
    </div>
  );
}

// ── Alerts: Liste + Lifecycle ─────────────────────────────────

function AlertsListPanel({
  apiFetch,
  dateTime,
  refreshNonce,
  flashSuccess,
  setError,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  dateTime: Intl.DateTimeFormat;
  refreshNonce: number;
  flashSuccess: (message: string) => void;
  setError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [statusFilter, setStatusFilter] = useState<"" | AlertStatus>("OPEN");
  const [severityFilter, setSeverityFilter] = useState<"" | AlertSeverity>("");
  const [alerts, setAlerts] = useState<PlanningAlertApi[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (severityFilter) params.set("severity", severityFilter);
      const list = await apiFetch<PlanningAlertApi[]>(
        `/planning/alerts${params.size > 0 ? `?${params.toString()}` : ""}`,
      );
      setAlerts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, statusFilter, severityFilter, l, setError]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  async function evaluate() {
    setSubmitting(true);
    try {
      const result = await apiFetch<AlertEvaluateResult>(
        "/planning/alerts/evaluate",
        { method: "POST", body: JSON.stringify({}) },
      );
      flashSuccess(
        l("profit.alerts.evaluate.success").replace(
          "{created}",
          String(result.alertsCreated),
        ),
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function ack(id: string) {
    if (typeof window !== "undefined" && !window.confirm(l("profit.alerts.confirmAck"))) {
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/alerts/${id}/ack`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      flashSuccess(l("profit.alerts.acked"));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function resolve(id: string) {
    if (typeof window !== "undefined" && !window.confirm(l("profit.alerts.confirmResolve"))) {
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/alerts/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      flashSuccess(l("profit.alerts.resolved"));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.alerts.heading")}
      subtitle={l("profit.alerts.subtitle")}
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <SelectField
          label={l("profit.alerts.col.status")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AlertStatus | "")}
          options={[
            { value: "", label: l("profit.alerts.filter.statusAll") },
            { value: "OPEN", label: l("profit.alerts.filter.statusOpen") },
            { value: "ACKNOWLEDGED", label: l("profit.alerts.filter.statusAck") },
            { value: "RESOLVED", label: l("profit.alerts.filter.statusResolved") },
          ]}
        />
        <SelectField
          label={l("profit.alerts.col.severity")}
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | "")}
          options={[
            { value: "", label: l("profit.alerts.filter.severityAll") },
            { value: "INFO", label: l("profit.alerts.filter.severityInfo") },
            { value: "WARN", label: l("profit.alerts.filter.severityWarn") },
            { value: "CRITICAL", label: l("profit.alerts.filter.severityCritical") },
          ]}
        />
        <div className="flex items-end">
          <SecondaryButton onClick={() => void evaluate()}>
            {submitting ? "…" : l("profit.alerts.action.evaluate")}
          </SecondaryButton>
        </div>
      </div>

      {alerts == null ? (
        <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.alerts.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.alerts.col.triggeredAt")}</th>
                <th className="py-2 pr-3">{l("profit.alerts.col.severity")}</th>
                <th className="py-2 pr-3">{l("profit.alerts.col.rule")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.alerts.col.value")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.alerts.col.threshold")}</th>
                <th className="py-2 pr-3">{l("profit.alerts.col.status")}</th>
                <th className="py-2 pr-3">{l("profit.alerts.col.context")}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1 pr-3 text-xs">
                    {dateTime.format(new Date(a.triggeredAt))}
                  </td>
                  <td className={cx("py-1 pr-3 text-xs font-medium", severityClass(a.severity))}>
                    {l(`profit.alerts.filter.severity${capitalize(a.severity.toLowerCase())}`)}
                  </td>
                  <td className="py-1 pr-3 text-xs">{a.rule?.name ?? "—"}</td>
                  <td className="py-1 pr-3 text-right font-mono text-xs">
                    {a.metricValue.toFixed(2)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono text-xs">
                    {a.thresholdValue.toFixed(2)}
                  </td>
                  <td className={cx("py-1 pr-3 text-xs font-medium", statusClass(a.status))}>
                    {l(`profit.alerts.filter.status${capitalize(a.status === "ACKNOWLEDGED" ? "ack" : a.status.toLowerCase())}`)}
                  </td>
                  <td className="py-1 pr-3 text-xs text-slate-500">
                    {formatContext(a.contextJson)}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <div className="flex justify-end gap-1">
                      {a.status === "OPEN" ? (
                        <button
                          type="button"
                          onClick={() => void ack(a.id)}
                          disabled={submitting}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                        >
                          {l("profit.alerts.action.ack")}
                        </button>
                      ) : null}
                      {a.status !== "RESOLVED" ? (
                        <button
                          type="button"
                          onClick={() => void resolve(a.id)}
                          disabled={submitting}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                        >
                          {l("profit.alerts.action.resolve")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function severityClass(sev: AlertSeverity) {
  if (sev === "CRITICAL") return "text-red-700 dark:text-red-400";
  if (sev === "WARN") return "text-amber-700 dark:text-amber-400";
  return "text-slate-600 dark:text-slate-400";
}

function statusClass(status: AlertStatus) {
  if (status === "OPEN") return "text-amber-700 dark:text-amber-400";
  if (status === "ACKNOWLEDGED") return "text-blue-700 dark:text-blue-400";
  return "text-emerald-700 dark:text-emerald-400";
}

function formatContext(ctx: Record<string, unknown> | null): string {
  if (!ctx) return "—";
  const parts: string[] = [];
  if (ctx.year && ctx.month) {
    parts.push(`${ctx.year}-${String(ctx.month).padStart(2, "0")}`);
  }
  if (typeof ctx.streak === "number") {
    parts.push(`Streak ${ctx.streak}`);
  }
  return parts.join(" · ") || "—";
}

// ── Alert-Regeln (CRUD) ───────────────────────────────────────

type AlertRuleDraft = {
  id: string | null;
  name: string;
  scenarioId: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: string;
  consecutiveMonths: string;
  severity: AlertSeverity;
  channelInApp: boolean;
  channelEmail: boolean;
  active: boolean;
};

const EMPTY_RULE: AlertRuleDraft = {
  id: null,
  name: "",
  scenarioId: "",
  metric: "marginPercent",
  operator: "lt",
  threshold: "0",
  consecutiveMonths: "1",
  severity: "WARN",
  channelInApp: true,
  channelEmail: false,
  active: true,
};

function AlertRulesPanel({
  apiFetch,
  scenarios,
  flashSuccess,
  setError,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenarios: PlanningScenarioApi[];
  flashSuccess: (message: string) => void;
  setError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [rules, setRules] = useState<PlanningAlertRuleApi[] | null>(null);
  const [draft, setDraft] = useState<AlertRuleDraft>(EMPTY_RULE);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<PlanningAlertRuleApi[]>(
        "/planning/alerts/rules",
      );
      setRules(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, l, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(r: PlanningAlertRuleApi) {
    setDraft({
      id: r.id,
      name: r.name,
      scenarioId: r.scenarioId ?? "",
      metric: r.metric,
      operator: r.operator,
      threshold: String(r.threshold),
      consecutiveMonths: String(r.consecutiveMonths),
      severity: r.severity,
      channelInApp: r.channelInApp,
      channelEmail: r.channelEmail,
      active: r.active,
    });
  }

  function resetDraft() {
    setDraft(EMPTY_RULE);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const threshold = Number.parseFloat(draft.threshold.replace(",", "."));
      if (!Number.isFinite(threshold)) {
        setError(l("common.error"));
        return;
      }
      const consecutiveMonths = Math.max(
        1,
        Math.min(24, Number.parseInt(draft.consecutiveMonths, 10) || 1),
      );
      const payload = {
        name: draft.name.trim(),
        scenarioId: draft.scenarioId || null,
        metric: draft.metric,
        operator: draft.operator,
        threshold,
        consecutiveMonths,
        severity: draft.severity,
        channelInApp: draft.channelInApp,
        channelEmail: draft.channelEmail,
        active: draft.active,
      };
      if (draft.id) {
        await apiFetch(`/planning/alerts/rules/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.alertRules.updated"));
      } else {
        await apiFetch("/planning/alerts/rules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.alertRules.created"));
      }
      resetDraft();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm(l("profit.alertRules.confirmDelete"))) {
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/alerts/rules/${id}`, { method: "DELETE" });
      flashSuccess(l("profit.alertRules.deleted"));
      if (draft.id === id) resetDraft();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.alertRules.heading")}
      subtitle={l("profit.alertRules.subtitle")}
    >
      <div className="grid gap-3">
        <FormRow>
          <Field
            label={l("profit.alertRules.field.name")}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <SelectField
            label={l("profit.alertRules.field.scenario")}
            value={draft.scenarioId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, scenarioId: e.target.value }))
            }
            options={[
              { value: "", label: l("profit.alertRules.scenarioAuto") },
              ...scenarios.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </FormRow>
        <FormRow>
          <SelectField
            label={l("profit.alertRules.field.metric")}
            value={draft.metric}
            onChange={(e) =>
              setDraft((d) => ({ ...d, metric: e.target.value as AlertMetric }))
            }
            options={[
              { value: "marginPercent", label: l("profit.alertRules.metric.marginPercent") },
              { value: "deltaRevenuePercent", label: l("profit.alertRules.metric.deltaRevenuePercent") },
              { value: "deltaCostPercent", label: l("profit.alertRules.metric.deltaCostPercent") },
              { value: "negativeMarginStreak", label: l("profit.alertRules.metric.negativeMarginStreak") },
              { value: "cashBalance", label: l("profit.alertRules.metric.cashBalance") },
              { value: "negativeCashflowStreak", label: l("profit.alertRules.metric.negativeCashflowStreak") },
              { value: "capexShare", label: l("profit.alertRules.metric.capexShare") },
              { value: "utilizationPercent", label: l("profit.alertRules.metric.utilizationPercent") },
              { value: "capacityDeltaHours", label: l("profit.alertRules.metric.capacityDeltaHours") },
              { value: "overloadWeeksStreak", label: l("profit.alertRules.metric.overloadWeeksStreak") },
              { value: "pipelineWeighted", label: l("profit.alertRules.metric.pipelineWeighted") },
              { value: "pipelineEarlyStageShare", label: l("profit.alertRules.metric.pipelineEarlyStageShare") },
            ]}
          />
          <SelectField
            label={l("profit.alertRules.field.operator")}
            value={draft.operator}
            onChange={(e) =>
              setDraft((d) => ({ ...d, operator: e.target.value as AlertOperator }))
            }
            options={[
              { value: "lt", label: l("profit.alertRules.operator.lt") },
              { value: "lte", label: l("profit.alertRules.operator.lte") },
              { value: "gt", label: l("profit.alertRules.operator.gt") },
              { value: "gte", label: l("profit.alertRules.operator.gte") },
            ]}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.alertRules.field.threshold")}
            type="number"
            value={draft.threshold}
            onChange={(e) =>
              setDraft((d) => ({ ...d, threshold: e.target.value }))
            }
          />
          <Field
            label={l("profit.alertRules.field.consecutiveMonths")}
            type="number"
            value={draft.consecutiveMonths}
            onChange={(e) =>
              setDraft((d) => ({ ...d, consecutiveMonths: e.target.value }))
            }
          />
        </FormRow>
        <FormRow>
          <SelectField
            label={l("profit.alertRules.field.severity")}
            value={draft.severity}
            onChange={(e) =>
              setDraft((d) => ({ ...d, severity: e.target.value as AlertSeverity }))
            }
            options={[
              { value: "INFO", label: l("profit.alerts.filter.severityInfo") },
              { value: "WARN", label: l("profit.alerts.filter.severityWarn") },
              { value: "CRITICAL", label: l("profit.alerts.filter.severityCritical") },
            ]}
          />
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.channelInApp}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, channelInApp: e.target.checked }))
                }
              />
              {l("profit.alertRules.field.channelInApp")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.channelEmail}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, channelEmail: e.target.checked }))
                }
              />
              {l("profit.alertRules.field.channelEmail")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, active: e.target.checked }))
                }
              />
              {l("profit.alertRules.field.active")}
            </label>
          </div>
        </FormRow>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={submitting || !draft.name.trim()}
            onClick={() => void submit()}
          >
            {draft.id
              ? l("profit.alertRules.action.update")
              : l("profit.alertRules.action.add")}
          </PrimaryButton>
          {draft.id ? (
            <SecondaryButton onClick={resetDraft}>
              {l("profit.editor.action.discard")}
            </SecondaryButton>
          ) : null}
        </div>

        {rules == null ? (
          <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-slate-500">{l("profit.alertRules.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="py-2 pr-3">{l("profit.alertRules.field.name")}</th>
                  <th className="py-2 pr-3">{l("profit.alertRules.field.metric")}</th>
                  <th className="py-2 pr-3">{l("profit.alertRules.field.operator")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.alertRules.field.threshold")}</th>
                  <th className="py-2 pr-3">{l("profit.alertRules.field.severity")}</th>
                  <th className="py-2 pr-3">{l("profit.alertRules.field.active")}</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 text-xs">{r.name}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{r.metric}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{r.operator}</td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {r.threshold}
                    </td>
                    <td className={cx("py-1 pr-3 text-xs font-medium", severityClass(r.severity))}>
                      {r.severity}
                    </td>
                    <td className="py-1 pr-3 text-xs">{r.active ? "✓" : "—"}</td>
                    <td className="py-1 pr-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
                        >
                          {l("profit.alertRules.action.update")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(r.id)}
                          disabled={submitting}
                          className="rounded-lg border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400"
                        >
                          {l("profit.alertRules.action.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Phase 7: Workflow + Baselines + Org-Lookups ────────────────

function StatusBadge({ status }: { status: ScenarioStatus }) {
  const { t: l } = useI18n();
  const tone =
    status === "APPROVED"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : status === "IN_REVIEW"
        ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
        : status === "REJECTED"
          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          : status === "ARCHIVED"
            ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/40 dark:text-slate-300"
            : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        tone,
      )}
    >
      {l(`profit.workflow.status.${status}`)}
    </span>
  );
}

function WorkflowPanel({
  apiFetch,
  scenario,
  locations,
  businessUnits,
  dateTime,
  canSubmit,
  canApprove,
  canReject,
  canManageBaseline,
  flashSuccess,
  setError,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenario: PlanningScenarioApi | null;
  locations: PlanningOrgRefApi[];
  businessUnits: PlanningOrgRefApi[];
  dateTime: Intl.DateTimeFormat;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canManageBaseline: boolean;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionLog, setDecisionLog] = useState<PlanningDecisionLogApi[] | null>(null);
  const [orgLocationId, setOrgLocationId] = useState<string>("");
  const [orgUnitId, setOrgUnitId] = useState<string>("");
  const [baselinePeriodType, setBaselinePeriodType] =
    useState<PlanningBaselinePeriodType>("MONTH");
  const [baselinePeriodRef, setBaselinePeriodRef] = useState("");
  const [baselineLocationId, setBaselineLocationId] = useState<string>("");
  const [baselineUnitId, setBaselineUnitId] = useState<string>("");

  const scenarioId = scenario?.id;
  const scenarioLocationId = scenario?.locationId;
  const scenarioUnitId = scenario?.businessUnitId;

  useEffect(() => {
    if (!scenarioId) return;
    setOrgLocationId(scenarioLocationId ?? "");
    setOrgUnitId(scenarioUnitId ?? "");
  }, [scenarioId, scenarioLocationId, scenarioUnitId]);

  const loadDecisionLog = useCallback(async () => {
    if (!scenarioId) return;
    try {
      const list = await apiFetch<PlanningDecisionLogApi[]>(
        `/planning/scenarios/${scenarioId}/decision-log`,
      );
      setDecisionLog(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, scenarioId, l, setError]);

  useEffect(() => {
    void loadDecisionLog();
  }, [loadDecisionLog]);

  if (!scenario) return null;
  const status: ScenarioStatus = scenario.status ?? "DRAFT";

  async function transition(action: "submit" | "approve" | "reject" | "archive" | "unarchive") {
    if (!scenario) return;
    if (action === "reject" && !comment.trim()) {
      setError(l("profit.workflow.requireRejectionComment"));
      return;
    }
    const confirmKey =
      action === "submit"
        ? "profit.workflow.confirmSubmit"
        : action === "approve"
          ? "profit.workflow.confirmApprove"
          : action === "archive"
            ? "profit.workflow.confirmArchive"
            : action === "unarchive"
              ? "profit.workflow.confirmUnarchive"
              : null;
    if (
      confirmKey &&
      typeof window !== "undefined" &&
      !window.confirm(l(confirmKey))
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload =
        action === "reject"
          ? { comment: comment.trim() }
          : { comment: comment.trim() || undefined };
      await apiFetch(`/planning/scenarios/${scenario.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      flashSuccess(l("profit.workflow.transitionedSuccess"));
      setComment("");
      onChanged();
      await loadDecisionLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveOrg() {
    if (!scenario) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/planning/scenarios/${scenario.id}/org`, {
        method: "PATCH",
        body: JSON.stringify({
          locationId: orgLocationId || null,
          businessUnitId: orgUnitId || null,
        }),
      });
      flashSuccess(l("profit.workflow.transitionedSuccess"));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function setAsBaseline() {
    if (!scenario) return;
    if (!baselinePeriodRef.trim()) {
      setError(l("common.error"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/planning/scenarios/${scenario.id}/set-baseline`, {
        method: "POST",
        body: JSON.stringify({
          periodType: baselinePeriodType,
          periodRef: baselinePeriodRef.trim(),
          locationId: baselineLocationId || null,
          businessUnitId: baselineUnitId || null,
        }),
      });
      flashSuccess(l("profit.baseline.set.success"));
      setBaselinePeriodRef("");
      onChanged();
      await loadDecisionLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={`${l("profit.workflow.decisionLog.heading")} — ${scenario.name}`}
      subtitle={l("profit.workflow.decisionLog.subtitle")}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={status} />
          {scenario.rejectionReason ? (
            <span className="text-xs text-red-700 dark:text-red-400">
              {l("profit.workflow.rejectionReason")}: {scenario.rejectionReason}
            </span>
          ) : null}
        </div>

        <FormRow>
          <SelectField
            label={l("profit.org.field.location")}
            value={orgLocationId}
            onChange={(e) => setOrgLocationId(e.target.value)}
            options={[
              { value: "", label: "—" },
              ...locations.map((loc) => ({
                value: loc.id,
                label: `${loc.name} (${loc.code})`,
              })),
            ]}
          />
          <SelectField
            label={l("profit.org.field.unit")}
            value={orgUnitId}
            onChange={(e) => setOrgUnitId(e.target.value)}
            options={[
              { value: "", label: "—" },
              ...businessUnits.map((u) => ({
                value: u.id,
                label: `${u.name} (${u.code})`,
              })),
            ]}
          />
        </FormRow>
        <div>
          <SecondaryButton onClick={() => void saveOrg()}>
            {l("profit.org.action.update")}
          </SecondaryButton>
        </div>

        <TextArea
          label={
            status === "IN_REVIEW"
              ? l("profit.workflow.commentRequired")
              : l("profit.workflow.commentOptional")
          }
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {status === "DRAFT" || status === "REJECTED" ? (
            <PrimaryButton
              disabled={!canSubmit || submitting}
              onClick={() => void transition("submit")}
            >
              {l("profit.workflow.action.submit")}
            </PrimaryButton>
          ) : null}
          {status === "IN_REVIEW" && canApprove ? (
            <button
              type="button"
              onClick={() => void transition("approve")}
              disabled={submitting}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              {l("profit.workflow.action.approve")}
            </button>
          ) : null}
          {status === "IN_REVIEW" && canReject ? (
            <button
              type="button"
              onClick={() => void transition("reject")}
              disabled={submitting}
              className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              {l("profit.workflow.action.reject")}
            </button>
          ) : null}
          {status !== "ARCHIVED" ? (
            <SecondaryButton onClick={() => void transition("archive")}>
              {l("profit.workflow.action.archive")}
            </SecondaryButton>
          ) : null}
          {status === "ARCHIVED" ? (
            <SecondaryButton onClick={() => void transition("unarchive")}>
              {l("profit.workflow.action.unarchive")}
            </SecondaryButton>
          ) : null}
        </div>

        {status === "APPROVED" && canManageBaseline ? (
          <fieldset className="rounded-2xl bg-emerald-50/60 p-3 dark:bg-emerald-500/5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {l("profit.baseline.action.set")}
            </legend>
            <FormRow>
              <SelectField
                label={l("profit.baseline.field.periodType")}
                value={baselinePeriodType}
                onChange={(e) =>
                  setBaselinePeriodType(
                    e.target.value as PlanningBaselinePeriodType,
                  )
                }
                options={[
                  { value: "MONTH", label: l("profit.baseline.periodType.MONTH") },
                  { value: "QUARTER", label: l("profit.baseline.periodType.QUARTER") },
                  { value: "YEAR", label: l("profit.baseline.periodType.YEAR") },
                ]}
              />
              <Field
                label={l("profit.baseline.field.periodRef")}
                value={baselinePeriodRef}
                onChange={(e) => setBaselinePeriodRef(e.target.value)}
                placeholder={l(`profit.baseline.placeholder.${baselinePeriodType}`)}
              />
            </FormRow>
            <FormRow>
              <SelectField
                label={l("profit.baseline.field.location")}
                value={baselineLocationId}
                onChange={(e) => setBaselineLocationId(e.target.value)}
                options={[
                  { value: "", label: "—" },
                  ...locations.map((loc) => ({
                    value: loc.id,
                    label: `${loc.name} (${loc.code})`,
                  })),
                ]}
              />
              <SelectField
                label={l("profit.baseline.field.unit")}
                value={baselineUnitId}
                onChange={(e) => setBaselineUnitId(e.target.value)}
                options={[
                  { value: "", label: "—" },
                  ...businessUnits.map((u) => ({
                    value: u.id,
                    label: `${u.name} (${u.code})`,
                  })),
                ]}
              />
            </FormRow>
            <div className="mt-2">
              <PrimaryButton
                disabled={!baselinePeriodRef.trim() || submitting}
                onClick={() => void setAsBaseline()}
              >
                {l("profit.baseline.action.set")}
              </PrimaryButton>
            </div>
          </fieldset>
        ) : null}

        <div>
          <h4 className="mb-2 mt-2 text-sm font-semibold">
            {l("profit.workflow.decisionLog.heading")}
          </h4>
          {decisionLog == null ? (
            <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
          ) : decisionLog.length === 0 ? (
            <p className="text-sm text-slate-500">
              {l("profit.workflow.decisionLog.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                    <th className="py-2 pr-3">{l("profit.workflow.decisionLog.colWhen")}</th>
                    <th className="py-2 pr-3">{l("profit.workflow.decisionLog.colAction")}</th>
                    <th className="py-2 pr-3">{l("profit.workflow.decisionLog.colWho")}</th>
                    <th className="py-2 pr-3">{l("profit.workflow.decisionLog.colComment")}</th>
                  </tr>
                </thead>
                <tbody>
                  {decisionLog.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className="py-1 pr-3 text-xs">
                        {dateTime.format(new Date(d.createdAt))}
                      </td>
                      <td className="py-1 pr-3 text-xs font-medium">
                        {l(`profit.workflow.action.${d.action}`)}
                      </td>
                      <td className="py-1 pr-3 text-xs">
                        {d.actor?.displayName ?? "—"}
                      </td>
                      <td className="py-1 pr-3 text-xs text-slate-500">
                        {d.comment ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function BaselinesListPanel({
  apiFetch,
  dateTime,
  canManage,
  refreshNonce,
  flashSuccess,
  setError,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  dateTime: Intl.DateTimeFormat;
  canManage: boolean;
  refreshNonce: number;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [baselines, setBaselines] = useState<PlanningBaselineApi[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<PlanningBaselineApi[]>(
        "/planning/baselines?activeOnly=true",
      );
      setBaselines(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, l, setError]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  async function unset(id: string) {
    if (typeof window !== "undefined" && !window.confirm(l("profit.baseline.confirmUnset"))) {
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/baselines/${id}/unset`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      flashSuccess(l("profit.baseline.unset.success"));
      onChanged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.baseline.heading")}
      subtitle={l("profit.baseline.subtitle")}
    >
      {baselines == null ? (
        <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
      ) : baselines.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.baseline.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.baseline.col.scenario")}</th>
                <th className="py-2 pr-3">{l("profit.baseline.col.period")}</th>
                <th className="py-2 pr-3">{l("profit.baseline.col.location")}</th>
                <th className="py-2 pr-3">{l("profit.baseline.col.unit")}</th>
                <th className="py-2 pr-3">{l("profit.baseline.col.setBy")}</th>
                <th className="py-2 pr-3">{l("profit.baseline.col.setAt")}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {baselines.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1 pr-3 text-xs">
                    {b.scenario?.name ?? b.scenarioId}
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs">
                    {l(`profit.baseline.periodType.${b.periodType}`)} {b.periodRef}
                  </td>
                  <td className="py-1 pr-3 text-xs">
                    {b.location ? `${b.location.code}` : "—"}
                  </td>
                  <td className="py-1 pr-3 text-xs">
                    {b.businessUnit ? `${b.businessUnit.code}` : "—"}
                  </td>
                  <td className="py-1 pr-3 text-xs">
                    {b.setBy?.displayName ?? "—"}
                  </td>
                  <td className="py-1 pr-3 text-xs">
                    {dateTime.format(new Date(b.setAt))}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => void unset(b.id)}
                        disabled={submitting}
                        className="rounded-lg border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400"
                      >
                        {l("profit.baseline.action.unset")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function OrgManagementPanel({
  apiFetch,
  flashSuccess,
  setError,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  return (
    <SectionCard
      title={l("profit.org.heading")}
      subtitle={l("profit.org.subtitle")}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <OrgRefList
          heading={l("profit.org.location.heading")}
          path="/planning/locations"
          apiFetch={apiFetch}
          flashSuccess={flashSuccess}
          setError={setError}
          onChanged={onChanged}
        />
        <OrgRefList
          heading={l("profit.org.unit.heading")}
          path="/planning/business-units"
          apiFetch={apiFetch}
          flashSuccess={flashSuccess}
          setError={setError}
          onChanged={onChanged}
        />
      </div>
    </SectionCard>
  );
}

function OrgRefList({
  heading,
  path,
  apiFetch,
  flashSuccess,
  setError,
  onChanged,
}: {
  heading: string;
  path: string;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [items, setItems] = useState<PlanningOrgRefApi[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch<PlanningOrgRefApi[]>(path);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, path, l, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setEditingId(null);
    setName("");
    setCode("");
  }

  async function submit() {
    if (!name.trim() || !code.trim()) {
      setError(l("common.error"));
      return;
    }
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), code: code.trim() };
      if (editingId) {
        await apiFetch(`${path}/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(path, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      flashSuccess(l("profit.workflow.transitionedSuccess"));
      reset();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (typeof window !== "undefined" && !window.confirm(l("profit.alertRules.confirmDelete"))) {
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`${path}/${id}`, { method: "DELETE" });
      flashSuccess(l("profit.workflow.transitionedSuccess"));
      if (editingId === id) reset();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-3">
      <h4 className="text-sm font-semibold">{heading}</h4>
      <FormRow>
        <Field
          label={l("profit.org.field.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label={l("profit.org.field.code")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </FormRow>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          disabled={submitting || !name.trim() || !code.trim()}
          onClick={() => void submit()}
        >
          {editingId ? l("profit.org.action.update") : l("profit.org.action.add")}
        </PrimaryButton>
        {editingId ? (
          <SecondaryButton onClick={reset}>
            {l("profit.editor.action.discard")}
          </SecondaryButton>
        ) : null}
      </div>
      {items == null ? (
        <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.org.empty")}</p>
      ) : (
        <ul className="grid gap-1">
          {items.map((it) => (
            <li
              key={it.id}
              className={cx(
                "flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-sm",
                it.active
                  ? "border-black/10 dark:border-white/10"
                  : "border-black/10 opacity-60 dark:border-white/10",
              )}
            >
              <span>
                <span className="font-mono text-xs uppercase">{it.code}</span>
                {" · "}
                {it.name}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(it.id);
                    setName(it.name);
                    setCode(it.code);
                  }}
                  className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800"
                >
                  {l("profit.org.action.update")}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(it.id)}
                  className="rounded-lg border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400"
                >
                  {l("profit.org.action.delete")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Phase 8: Budget + Cashflow ────────────────────────────────

type BudgetDraft = {
  id: string | null;
  category: string;
  name: string;
  costType: CostType;
  amount: string;
  frequency: BudgetFrequency;
  startDate: string;
  endDate: string;
};

const EMPTY_BUDGET: BudgetDraft = {
  id: null,
  category: "",
  name: "",
  costType: "OPEX",
  amount: "",
  frequency: "MONTHLY",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
};

function BudgetPanel({
  apiFetch,
  scenarioId,
  canEdit,
  eur,
  percent,
  flashSuccess,
  setError,
  refreshNonce,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenarioId: string;
  canEdit: boolean;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  refreshNonce: number;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [items, setItems] = useState<PlanningBudgetItemApi[] | null>(null);
  const [kpis, setKpis] = useState<FinancialKpisApi | null>(null);
  const [draft, setDraft] = useState<BudgetDraft>(EMPTY_BUDGET);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [itemsRes, kpisRes] = await Promise.all([
        apiFetch<PlanningBudgetItemApi[]>(
          `/planning/scenarios/${scenarioId}/budget-items`,
        ),
        apiFetch<FinancialKpisApi>(
          `/planning/scenarios/${scenarioId}/financial-kpis?months=6`,
        ),
      ]);
      setItems(itemsRes);
      setKpis(kpisRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, scenarioId, l, setError]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  function startEdit(item: PlanningBudgetItemApi) {
    setDraft({
      id: item.id,
      category: item.category,
      name: item.name,
      costType: item.costType,
      amount: String(item.amount),
      frequency: item.frequency,
      startDate: item.startDate.slice(0, 10),
      endDate: item.endDate ? item.endDate.slice(0, 10) : "",
    });
  }

  function reset() {
    setDraft(EMPTY_BUDGET);
  }

  async function submit() {
    if (!canEdit) return;
    const amount = Number.parseFloat(draft.amount.replace(",", "."));
    if (!draft.category.trim() || !draft.name.trim() || !Number.isFinite(amount)) {
      setError(l("common.error"));
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        category: draft.category.trim(),
        name: draft.name.trim(),
        costType: draft.costType,
        amount,
        frequency: draft.frequency,
        startDate: draft.startDate,
      };
      if (draft.endDate) payload.endDate = draft.endDate;
      else if (draft.id) payload.endDate = null;
      if (draft.id) {
        await apiFetch(`/planning/budget-items/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.budget.updated"));
      } else {
        await apiFetch(`/planning/scenarios/${scenarioId}/budget-items`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.budget.created"));
      }
      reset();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!canEdit) return;
    if (typeof window !== "undefined" && !window.confirm(l("profit.budget.confirmDelete"))) {
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/budget-items/${id}`, { method: "DELETE" });
      flashSuccess(l("profit.budget.deleted"));
      if (draft.id === id) reset();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.budget.heading")}
      subtitle={l("profit.budget.subtitle")}
    >
      {!canEdit ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {l("profit.budget.editRequiresPermission")}
        </p>
      ) : null}

      {kpis ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <FinancialKpi
            label={l("profit.budget.totals.opex")}
            value={eur.format(kpis.budgetTotals.opex)}
          />
          <FinancialKpi
            label={l("profit.budget.totals.capex")}
            value={eur.format(kpis.budgetTotals.capex)}
          />
          <FinancialKpi
            label={l("profit.budget.totals.capexShare")}
            value={percent.format(kpis.budgetTotals.capexShare / 100)}
          />
          <FinancialKpi
            label={l("profit.budget.totals.totalResult")}
            value={eur.format(kpis.totalResult)}
            highlight={kpis.totalResult >= 0}
            warn={kpis.totalResult < 0}
          />
        </div>
      ) : null}

      <div className="grid gap-3">
        <FormRow>
          <Field
            label={l("profit.budget.field.category")}
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          />
          <Field
            label={l("profit.budget.field.name")}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </FormRow>
        <FormRow>
          <SelectField
            label={l("profit.budget.field.costType")}
            value={draft.costType}
            onChange={(e) =>
              setDraft((d) => ({ ...d, costType: e.target.value as CostType }))
            }
            options={[
              { value: "OPEX", label: l("profit.budget.costType.OPEX") },
              { value: "CAPEX", label: l("profit.budget.costType.CAPEX") },
            ]}
          />
          <SelectField
            label={l("profit.budget.field.frequency")}
            value={draft.frequency}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                frequency: e.target.value as BudgetFrequency,
              }))
            }
            options={[
              { value: "ONE_TIME", label: l("profit.budget.frequency.ONE_TIME") },
              { value: "MONTHLY", label: l("profit.budget.frequency.MONTHLY") },
              { value: "QUARTERLY", label: l("profit.budget.frequency.QUARTERLY") },
            ]}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.budget.field.amount")}
            type="number"
            value={draft.amount}
            onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
          />
          <div />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.budget.field.startDate")}
            type="date"
            value={draft.startDate}
            onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
          />
          <Field
            label={l("profit.budget.field.endDate")}
            type="date"
            value={draft.endDate}
            onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
          />
        </FormRow>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={!canEdit || submitting}
            onClick={() => void submit()}
          >
            {draft.id ? l("profit.budget.action.update") : l("profit.budget.action.add")}
          </PrimaryButton>
          {draft.id ? (
            <SecondaryButton onClick={reset}>
              {l("profit.editor.action.discard")}
            </SecondaryButton>
          ) : null}
        </div>

        {items == null ? (
          <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">{l("profit.budget.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="py-2 pr-3">{l("profit.budget.field.category")}</th>
                  <th className="py-2 pr-3">{l("profit.budget.field.name")}</th>
                  <th className="py-2 pr-3">{l("profit.budget.field.costType")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.budget.field.amount")}</th>
                  <th className="py-2 pr-3">{l("profit.budget.field.frequency")}</th>
                  <th className="py-2 pr-3">{l("profit.budget.field.startDate")}</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 text-xs">{it.category}</td>
                    <td className="py-1 pr-3 text-xs">{it.name}</td>
                    <td className={cx("py-1 pr-3 text-xs font-medium", it.costType === "CAPEX" ? "text-amber-700 dark:text-amber-400" : "text-slate-600 dark:text-slate-300")}>
                      {l(`profit.budget.costType.${it.costType}`)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(it.amount)}
                    </td>
                    <td className="py-1 pr-3 text-xs">
                      {l(`profit.budget.frequency.${it.frequency}`)}
                    </td>
                    <td className="py-1 pr-3 font-mono text-xs">
                      {it.startDate.slice(0, 10)}
                      {it.endDate ? ` → ${it.endDate.slice(0, 10)}` : ""}
                    </td>
                    <td className="py-1 pr-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(it)}
                          disabled={!canEdit}
                          className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-slate-800"
                        >
                          {l("profit.budget.action.update")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(it.id)}
                          disabled={!canEdit || submitting}
                          className="rounded-lg border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400"
                        >
                          {l("profit.budget.action.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function CashflowPanel({
  apiFetch,
  scenarioId,
  canEditConfig,
  eur,
  flashSuccess,
  setError,
  refreshNonce,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenarioId: string;
  canEditConfig: boolean;
  eur: Intl.NumberFormat;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  refreshNonce: number;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [range, setRange] = useState<"6" | "12">("6");
  const [data, setData] = useState<CashflowProjectionApi | null>(null);
  const [, setConfig] = useState<PlanningCashflowConfigApi | null>(null);
  const [draftStartingCash, setDraftStartingCash] = useState("0");
  const [draftRevenueDelay, setDraftRevenueDelay] = useState("0");
  const [draftExpenseDelay, setDraftExpenseDelay] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const loadProjection = useCallback(async () => {
    try {
      const proj = await apiFetch<CashflowProjectionApi>(
        `/planning/scenarios/${scenarioId}/cashflow?months=${range}`,
      );
      setData(proj);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, scenarioId, range, l, setError]);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await apiFetch<PlanningCashflowConfigApi>(
        `/planning/scenarios/${scenarioId}/cashflow-config`,
      );
      setConfig(cfg);
      setDraftStartingCash(String(cfg.startingCash));
      setDraftRevenueDelay(String(cfg.revenueDelayDays));
      setDraftExpenseDelay(String(cfg.expenseDelayDays));
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, scenarioId, l, setError]);

  useEffect(() => {
    void loadProjection();
  }, [loadProjection, refreshNonce]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig, refreshNonce]);

  async function saveConfig() {
    if (!canEditConfig) return;
    const startingCash = Number.parseFloat(draftStartingCash.replace(",", "."));
    const revDelay = Number.parseInt(draftRevenueDelay, 10);
    const expDelay = Number.parseInt(draftExpenseDelay, 10);
    if (!Number.isFinite(startingCash) || !Number.isFinite(revDelay) || !Number.isFinite(expDelay)) {
      setError(l("common.error"));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/scenarios/${scenarioId}/cashflow-config`, {
        method: "PATCH",
        body: JSON.stringify({
          startingCash,
          revenueDelayDays: revDelay,
          expenseDelayDays: expDelay,
        }),
      });
      flashSuccess(l("profit.cashflow.config.saved"));
      await loadConfig();
      await loadProjection();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.cashflow.heading")}
      subtitle={l("profit.cashflow.subtitle")}
    >
      <div className="grid gap-3">
        <fieldset className="rounded-2xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {l("profit.cashflow.config.heading")}
          </legend>
          <FormRow>
            <Field
              label={l("profit.cashflow.config.startingCash")}
              type="number"
              value={draftStartingCash}
              onChange={(e) => setDraftStartingCash(e.target.value)}
            />
            <Field
              label={l("profit.cashflow.config.revenueDelay")}
              type="number"
              value={draftRevenueDelay}
              onChange={(e) => setDraftRevenueDelay(e.target.value)}
            />
          </FormRow>
          <FormRow>
            <Field
              label={l("profit.cashflow.config.expenseDelay")}
              type="number"
              value={draftExpenseDelay}
              onChange={(e) => setDraftExpenseDelay(e.target.value)}
            />
            <div />
          </FormRow>
          <div>
            <PrimaryButton
              disabled={!canEditConfig || submitting}
              onClick={() => void saveConfig()}
            >
              {l("profit.cashflow.config.save")}
            </PrimaryButton>
          </div>
        </fieldset>

        <SelectField
          label={l("profit.cashflow.heading")}
          value={range}
          onChange={(e) => setRange(e.target.value as "6" | "12")}
          options={[
            { value: "6", label: l("profit.cashflow.range6m") },
            { value: "12", label: l("profit.cashflow.range12m") },
          ]}
        />

        {data ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <FinancialKpi
                label={l("profit.cashflow.totals.netCashflow")}
                value={eur.format(data.totals.netCashflow)}
                highlight={data.totals.netCashflow >= 0}
                warn={data.totals.netCashflow < 0}
              />
              <FinancialKpi
                label={l("profit.cashflow.totals.minCumulative")}
                value={eur.format(data.minCumulativeCash)}
                highlight={data.minCumulativeCash >= 0}
                warn={data.minCumulativeCash < 0}
              />
            </div>
            {data.minCumulativeCash < 0 ? (
              <p className="text-xs text-red-700 dark:text-red-400">
                {l("profit.cashflow.minWarning")}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                    <th className="py-2 pr-3">{l("profit.cashflow.col.month")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.cashflow.col.cashIn")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.cashflow.col.cashOutOpex")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.cashflow.col.cashOutCapex")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.cashflow.col.netCashflow")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.cashflow.col.cumulativeCash")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => {
                    const positiveNet = m.netCashflow >= 0;
                    const positiveCum = m.cumulativeCash >= 0;
                    return (
                      <tr
                        key={`${m.year}-${m.month}`}
                        className="border-b border-black/5 last:border-0 dark:border-white/5"
                      >
                        <td className="py-1 pr-3 font-mono text-xs">
                          {m.year}-{String(m.month).padStart(2, "0")}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-xs">
                          {eur.format(m.cashIn)}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-xs">
                          {eur.format(m.cashOutOpex)}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-xs">
                          {eur.format(m.cashOutCapex)}
                        </td>
                        <td
                          className={cx(
                            "py-1 pr-3 text-right font-mono text-xs",
                            positiveNet
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400",
                          )}
                        >
                          {eur.format(m.netCashflow)}
                        </td>
                        <td
                          className={cx(
                            "py-1 pr-3 text-right font-mono text-xs",
                            positiveCum
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400",
                          )}
                        >
                          {eur.format(m.cumulativeCash)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
        )}
      </div>
    </SectionCard>
  );
}

// ── Phase 9: Kapazitaet + Auslastung + Bottlenecks ──────────────

function CapacityPanel({
  apiFetch,
  scenarioId,
  canEdit,
  percent,
  flashSuccess,
  setError,
  refreshNonce,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  scenarioId: string;
  canEdit: boolean;
  percent: Intl.NumberFormat;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  refreshNonce: number;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [profile, setProfile] = useState<CapacityProfileApi | null>(null);
  const [utilization, setUtilization] =
    useState<UtilizationProjectionApi | null>(null);
  const [bottlenecks, setBottlenecks] = useState<BottlenecksApi | null>(null);
  const [weeks, setWeeks] = useState<"12" | "26">("12");
  const [draftTarget, setDraftTarget] = useState("40");
  const [draftAvailability, setDraftAvailability] = useState("0.85");
  const [draftProductivity, setDraftProductivity] = useState("0.95");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [p, u, b] = await Promise.all([
        apiFetch<CapacityProfileApi>(
          `/planning/scenarios/${scenarioId}/capacity`,
        ),
        apiFetch<UtilizationProjectionApi>(
          `/planning/scenarios/${scenarioId}/utilization?weeks=${weeks}`,
        ),
        apiFetch<BottlenecksApi>(
          `/planning/scenarios/${scenarioId}/bottlenecks?weeks=${weeks}`,
        ),
      ]);
      setProfile(p);
      setUtilization(u);
      setBottlenecks(b);
      setDraftTarget(String(p.weeklyTargetHours));
      setDraftAvailability(String(p.availabilityFactor));
      setDraftProductivity(String(p.productivityFactor));
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, scenarioId, weeks, l, setError]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshNonce]);

  async function saveProfile() {
    if (!canEdit) return;
    const target = Number.parseFloat(draftTarget.replace(",", "."));
    const avail = Number.parseFloat(draftAvailability.replace(",", "."));
    const prod = Number.parseFloat(draftProductivity.replace(",", "."));
    if (
      !Number.isFinite(target) ||
      !Number.isFinite(avail) ||
      !Number.isFinite(prod)
    ) {
      setError(l("common.error"));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/scenarios/${scenarioId}/capacity`, {
        method: "PATCH",
        body: JSON.stringify({
          weeklyTargetHours: target,
          availabilityFactor: avail,
          productivityFactor: prod,
        }),
      });
      flashSuccess(l("profit.capacity.profile.saved"));
      await loadAll();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.capacity.heading")}
      subtitle={l("profit.capacity.subtitle")}
    >
      {!canEdit ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {l("profit.capacity.editRequiresPermission")}
        </p>
      ) : null}

      <fieldset className="mb-4 rounded-2xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {l("profit.capacity.profile.heading")}
        </legend>
        <FormRow>
          <Field
            label={l("profit.capacity.profile.weeklyTargetHours")}
            type="number"
            value={draftTarget}
            onChange={(e) => setDraftTarget(e.target.value)}
          />
          <Field
            label={l("profit.capacity.profile.availability")}
            type="number"
            value={draftAvailability}
            onChange={(e) => setDraftAvailability(e.target.value)}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.capacity.profile.productivity")}
            type="number"
            value={draftProductivity}
            onChange={(e) => setDraftProductivity(e.target.value)}
          />
          <div />
        </FormRow>
        <div>
          <PrimaryButton
            disabled={!canEdit || submitting}
            onClick={() => void saveProfile()}
          >
            {l("profit.capacity.profile.save")}
          </PrimaryButton>
        </div>
      </fieldset>

      {profile ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <FinancialKpi
            label={l("profit.capacity.kpi.perWorker")}
            value={`${profile.availableHoursPerWorkerWeek.toFixed(2)} h`}
          />
          <FinancialKpi
            label={l("profit.capacity.kpi.perTeam")}
            value={`${profile.availableHoursPerTeamWeek.toFixed(2)} h`}
          />
          <FinancialKpi
            label={l("profit.capacity.kpi.total")}
            value={`${profile.availableHoursWeekTotal.toFixed(2)} h`}
          />
          <FinancialKpi
            label={l("profit.capacity.kpi.demand")}
            value={`${profile.demandHoursWeek.toFixed(2)} h`}
          />
          <FinancialKpi
            label={l("profit.capacity.kpi.delta")}
            value={`${profile.capacityDeltaWeek.toFixed(2)} h`}
            highlight={profile.capacityDeltaWeek >= 0}
            warn={profile.capacityDeltaWeek < 0}
          />
          <FinancialKpi
            label={l("profit.capacity.kpi.utilization")}
            value={percent.format(profile.utilizationPercentWeek / 100)}
            highlight={profile.utilizationPercentWeek <= 100}
            warn={profile.utilizationPercentWeek > 100}
          />
        </div>
      ) : null}

      <div className="mb-3">
        <SelectField
          label={l("profit.utilization.heading")}
          value={weeks}
          onChange={(e) => setWeeks(e.target.value as "12" | "26")}
          options={[
            { value: "12", label: l("profit.utilization.range12") },
            { value: "26", label: l("profit.utilization.range26") },
          ]}
        />
      </div>

      {utilization ? (
        <UtilizationMatrix data={utilization} percent={percent} />
      ) : null}

      {bottlenecks ? (
        <BottleneckList bottlenecks={bottlenecks} percent={percent} />
      ) : null}
    </SectionCard>
  );
}

function UtilizationMatrix({
  data,
  percent,
}: {
  data: UtilizationProjectionApi;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <FinancialKpi
          label={l("profit.utilization.totals.average")}
          value={percent.format(data.averageUtilizationPercent / 100)}
          highlight={data.averageUtilizationPercent <= 100}
          warn={data.averageUtilizationPercent > 100}
        />
        <FinancialKpi
          label={l("profit.utilization.totals.peak")}
          value={percent.format(data.peakUtilizationPercent / 100)}
          highlight={data.peakUtilizationPercent <= 100}
          warn={data.peakUtilizationPercent > 100}
        />
        <FinancialKpi
          label={l("profit.utilization.totals.weeksOver")}
          value={String(data.weeksOverThreshold)}
        />
        <FinancialKpi
          label={l("profit.utilization.totals.minDelta")}
          value={`${data.minDeltaHours.toFixed(0)} h`}
          highlight={data.minDeltaHours >= 0}
          warn={data.minDeltaHours < 0}
        />
      </div>

      <div className="grid grid-flow-col auto-cols-fr gap-1">
        {data.weeks.map((w) => (
          <div
            key={`${w.isoYear}-${w.isoWeek}`}
            className={cx(
              "rounded border px-2 py-2 text-center text-xs",
              statusTileClass(w.status),
            )}
            title={`${w.isoYear}-W${String(w.isoWeek).padStart(2, "0")}: ${percent.format(w.utilizationPercent / 100)} (${w.deltaHours.toFixed(0)} h)`}
          >
            <div className="font-mono text-[11px]">
              W{String(w.isoWeek).padStart(2, "0")}
            </div>
            <div className="font-mono text-[10px] opacity-70">
              {percent.format(w.utilizationPercent / 100)}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
              <th className="py-2 pr-3">{l("profit.utilization.col.week")}</th>
              <th className="py-2 pr-3 text-right">{l("profit.utilization.col.available")}</th>
              <th className="py-2 pr-3 text-right">{l("profit.utilization.col.demand")}</th>
              <th className="py-2 pr-3 text-right">{l("profit.utilization.col.delta")}</th>
              <th className="py-2 pr-3 text-right">{l("profit.utilization.col.utilization")}</th>
              <th className="py-2 pr-3">{l("profit.utilization.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr
                key={`${w.isoYear}-${w.isoWeek}`}
                className="border-b border-black/5 last:border-0 dark:border-white/5"
              >
                <td className="py-1 pr-3 font-mono text-xs">
                  {w.isoYear}-W{String(w.isoWeek).padStart(2, "0")}
                </td>
                <td className="py-1 pr-3 text-right font-mono text-xs">
                  {w.availableHours.toFixed(0)}
                </td>
                <td className="py-1 pr-3 text-right font-mono text-xs">
                  {w.demandHours.toFixed(0)}
                </td>
                <td
                  className={cx(
                    "py-1 pr-3 text-right font-mono text-xs",
                    w.deltaHours >= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-red-700 dark:text-red-400",
                  )}
                >
                  {w.deltaHours.toFixed(0)}
                </td>
                <td className="py-1 pr-3 text-right font-mono text-xs">
                  {percent.format(w.utilizationPercent / 100)}
                </td>
                <td className={cx("py-1 pr-3 text-xs font-medium", statusTextClass(w.status))}>
                  {l(`profit.utilization.status.${w.status}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusTileClass(status: UtilizationStatus) {
  if (status === "red") {
    return "border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";
  }
  if (status === "yellow") {
    return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";
}

function statusTextClass(status: UtilizationStatus) {
  if (status === "red") return "text-red-700 dark:text-red-400";
  if (status === "yellow") return "text-amber-700 dark:text-amber-400";
  return "text-emerald-700 dark:text-emerald-400";
}

function BottleneckList({
  bottlenecks,
  percent,
}: {
  bottlenecks: BottlenecksApi;
  percent: Intl.NumberFormat;
}) {
  const { t: l } = useI18n();
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-semibold">{l("profit.bottleneck.heading")}</h4>
      <p className="mb-2 text-xs text-slate-500">{l("profit.bottleneck.subtitle")}</p>
      {bottlenecks.weeks.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.bottleneck.empty")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="py-2 pr-3">{l("profit.bottleneck.col.week")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.bottleneck.col.utilization")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.bottleneck.col.shortfall")}</th>
                  <th className="py-2 pr-3 text-right">{l("profit.bottleneck.col.additionalTeams")}</th>
                </tr>
              </thead>
              <tbody>
                {bottlenecks.weeks.map((b) => (
                  <tr
                    key={`${b.isoYear}-${b.isoWeek}`}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 font-mono text-xs">
                      {b.isoYear}-W{String(b.isoWeek).padStart(2, "0")}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs text-red-700 dark:text-red-400">
                      {percent.format(b.utilizationPercent / 100)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {b.shortfallHours.toFixed(0)} h
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      +{b.additionalTeams}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bottlenecks.suggestion ? (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <strong>{l("profit.bottleneck.suggestion")}:</strong>{" "}
              {bottlenecks.suggestion}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── Phase 10: Vertriebs-Pipeline ─────────────────────────────────

const PIPELINE_STAGES_FE: PipelineStage[] = [
  "LEAD",
  "QUALIFIED",
  "OFFERED",
  "NEGOTIATION",
  "WON",
  "LOST",
];

type PipelineDraft = {
  id: string | null;
  title: string;
  stage: PipelineStage;
  amountTotal: string;
  winProbability: string;
  expectedStartDate: string;
  expectedEndDate: string;
  expectedWeeklyHours: string;
  notes: string;
};

const EMPTY_PIPELINE: PipelineDraft = {
  id: null,
  title: "",
  stage: "LEAD",
  amountTotal: "",
  winProbability: "20",
  expectedStartDate: new Date().toISOString().slice(0, 10),
  expectedEndDate: "",
  expectedWeeklyHours: "",
  notes: "",
};

function PipelinePanel({
  apiFetch,
  canEdit,
  eur,
  percent,
  flashSuccess,
  setError,
  refreshNonce,
  onChanged,
}: {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  canEdit: boolean;
  eur: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  flashSuccess: (msg: string) => void;
  setError: (msg: string | null) => void;
  refreshNonce: number;
  onChanged: () => void;
}) {
  const { t: l } = useI18n();
  const [items, setItems] = useState<PlanningPipelineItemApi[] | null>(null);
  const [forecast, setForecast] = useState<PipelineForecastResult | null>(null);
  const [scenario, setScenario] = useState<PipelineScenario>("base");
  const [range, setRange] = useState<PipelineRange>("month");
  const [stageFilter, setStageFilter] = useState<"" | PipelineStage>("");
  const [draft, setDraft] = useState<PipelineDraft>(EMPTY_PIPELINE);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (stageFilter) params.set("stage", stageFilter);
      const [list, fc] = await Promise.all([
        apiFetch<PlanningPipelineItemApi[]>(
          `/planning/pipeline${params.size ? `?${params.toString()}` : ""}`,
        ),
        apiFetch<PipelineForecastResult>(
          `/planning/pipeline/forecast?range=${range}&scenario=${scenario}`,
        ),
      ]);
      setItems(list);
      setForecast(fc);
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    }
  }, [apiFetch, stageFilter, range, scenario, l, setError]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  function startEdit(item: PlanningPipelineItemApi) {
    setDraft({
      id: item.id,
      title: item.title,
      stage: item.stage,
      amountTotal: String(item.amountTotal),
      winProbability: String(item.winProbability),
      expectedStartDate: item.expectedStartDate.slice(0, 10),
      expectedEndDate: item.expectedEndDate
        ? item.expectedEndDate.slice(0, 10)
        : "",
      expectedWeeklyHours:
        item.expectedWeeklyHours != null
          ? String(item.expectedWeeklyHours)
          : "",
      notes: item.notes ?? "",
    });
  }

  function reset() {
    setDraft(EMPTY_PIPELINE);
  }

  async function submit() {
    if (!canEdit) return;
    const amount = Number.parseFloat(draft.amountTotal.replace(",", "."));
    const prob = Number.parseFloat(draft.winProbability.replace(",", "."));
    if (
      !draft.title.trim() ||
      !Number.isFinite(amount) ||
      !Number.isFinite(prob)
    ) {
      setError(l("common.error"));
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: draft.title.trim(),
        stage: draft.stage,
        amountTotal: amount,
        winProbability: prob,
        expectedStartDate: draft.expectedStartDate,
      };
      if (draft.expectedEndDate)
        payload.expectedEndDate = draft.expectedEndDate;
      else if (draft.id) payload.expectedEndDate = null;
      if (draft.expectedWeeklyHours.trim()) {
        const hours = Number.parseFloat(
          draft.expectedWeeklyHours.replace(",", "."),
        );
        if (Number.isFinite(hours)) payload.expectedWeeklyHours = hours;
      } else if (draft.id) {
        payload.expectedWeeklyHours = null;
      }
      if (draft.notes.trim()) payload.notes = draft.notes.trim();
      else if (draft.id) payload.notes = null;
      if (draft.id) {
        await apiFetch(`/planning/pipeline/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.pipeline.updated"));
      } else {
        await apiFetch("/planning/pipeline", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        flashSuccess(l("profit.pipeline.created"));
      }
      reset();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function quickStage(item: PlanningPipelineItemApi, stage: PipelineStage) {
    if (!canEdit) return;
    setSubmitting(true);
    try {
      await apiFetch(`/planning/pipeline/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      });
      flashSuccess(l("profit.pipeline.updated"));
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!canEdit) return;
    if (typeof window !== "undefined" && !window.confirm(l("profit.pipeline.confirmDelete"))) {
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/planning/pipeline/${id}`, { method: "DELETE" });
      flashSuccess(l("profit.pipeline.deleted"));
      if (draft.id === id) reset();
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : l("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title={l("profit.pipeline.heading")}
      subtitle={l("profit.pipeline.subtitle")}
    >
      {!canEdit ? (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {l("profit.pipeline.editRequiresPermission")}
        </p>
      ) : null}

      {/* Forecast controls */}
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <SelectField
          label={l("profit.pipeline.field.scenario")}
          value={scenario}
          onChange={(e) => setScenario(e.target.value as PipelineScenario)}
          options={[
            { value: "base", label: l("profit.pipeline.scenario.base") },
            { value: "best", label: l("profit.pipeline.scenario.best") },
            { value: "worst", label: l("profit.pipeline.scenario.worst") },
          ]}
        />
        <SelectField
          label={l("profit.pipeline.field.range")}
          value={range}
          onChange={(e) => setRange(e.target.value as PipelineRange)}
          options={[
            { value: "month", label: l("profit.pipeline.range.month") },
            { value: "quarter", label: l("profit.pipeline.range.quarter") },
            { value: "halfyear", label: l("profit.pipeline.range.halfyear") },
          ]}
        />
        <SelectField
          label={l("profit.pipeline.field.stage")}
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as "" | PipelineStage)}
          options={[
            { value: "", label: "—" },
            ...PIPELINE_STAGES_FE.map((s) => ({
              value: s,
              label: l(`profit.pipeline.stage.${s}`),
            })),
          ]}
        />
      </div>

      {/* KPI cards */}
      {forecast ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <FinancialKpi
            label={l("profit.pipeline.kpi.totalAmount")}
            value={eur.format(forecast.totals.totalAmount)}
          />
          <FinancialKpi
            label={l("profit.pipeline.kpi.weightedAmount")}
            value={eur.format(forecast.totals.weightedAmount)}
            highlight={forecast.totals.weightedAmount > 0}
          />
          <FinancialKpi
            label={l("profit.pipeline.kpi.wonAmount")}
            value={eur.format(forecast.totals.wonAmount)}
            highlight={forecast.totals.wonAmount > 0}
          />
          <FinancialKpi
            label={l("profit.pipeline.kpi.earlyShare")}
            value={percent.format(
              forecast.totals.earlyStageWeightedShare / 100,
            )}
            warn={forecast.totals.earlyStageWeightedShare > 60}
          />
          <FinancialKpi
            label={l("profit.pipeline.kpi.expectedHours")}
            value={`${forecast.totals.expectedWeeklyHours.toFixed(1)} h`}
          />
        </div>
      ) : null}

      {/* Editor form */}
      <fieldset className="mb-4 rounded-2xl bg-slate-50/70 p-3 dark:bg-slate-950/40">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {draft.id
            ? l("profit.pipeline.action.update")
            : l("profit.pipeline.action.add")}
        </legend>
        <FormRow>
          <Field
            label={l("profit.pipeline.field.title")}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <SelectField
            label={l("profit.pipeline.field.stage")}
            value={draft.stage}
            onChange={(e) =>
              setDraft((d) => ({ ...d, stage: e.target.value as PipelineStage }))
            }
            options={PIPELINE_STAGES_FE.map((s) => ({
              value: s,
              label: l(`profit.pipeline.stage.${s}`),
            }))}
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.pipeline.field.amountTotal")}
            type="number"
            value={draft.amountTotal}
            onChange={(e) =>
              setDraft((d) => ({ ...d, amountTotal: e.target.value }))
            }
          />
          <Field
            label={l("profit.pipeline.field.winProbability")}
            type="number"
            value={draft.winProbability}
            onChange={(e) =>
              setDraft((d) => ({ ...d, winProbability: e.target.value }))
            }
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.pipeline.field.expectedStartDate")}
            type="date"
            value={draft.expectedStartDate}
            onChange={(e) =>
              setDraft((d) => ({ ...d, expectedStartDate: e.target.value }))
            }
          />
          <Field
            label={l("profit.pipeline.field.expectedEndDate")}
            type="date"
            value={draft.expectedEndDate}
            onChange={(e) =>
              setDraft((d) => ({ ...d, expectedEndDate: e.target.value }))
            }
          />
        </FormRow>
        <FormRow>
          <Field
            label={l("profit.pipeline.field.expectedWeeklyHours")}
            type="number"
            value={draft.expectedWeeklyHours}
            onChange={(e) =>
              setDraft((d) => ({ ...d, expectedWeeklyHours: e.target.value }))
            }
          />
          <div />
        </FormRow>
        <TextArea
          label={l("profit.pipeline.field.notes")}
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <PrimaryButton
            disabled={!canEdit || submitting || !draft.title.trim()}
            onClick={() => void submit()}
          >
            {draft.id
              ? l("profit.pipeline.action.update")
              : l("profit.pipeline.action.add")}
          </PrimaryButton>
          {draft.id ? (
            <SecondaryButton onClick={reset}>
              {l("profit.editor.action.discard")}
            </SecondaryButton>
          ) : null}
        </div>
      </fieldset>

      {/* List */}
      {items == null ? (
        <p className="text-sm text-slate-500">{l("profit.list.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{l("profit.pipeline.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                <th className="py-2 pr-3">{l("profit.pipeline.col.title")}</th>
                <th className="py-2 pr-3">{l("profit.pipeline.col.stage")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.pipeline.col.amount")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.pipeline.col.probability")}</th>
                <th className="py-2 pr-3 text-right">{l("profit.pipeline.col.weighted")}</th>
                <th className="py-2 pr-3">{l("profit.pipeline.col.start")}</th>
                <th className="py-2 pr-3">{l("profit.pipeline.col.owner")}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const weighted = it.amountTotal * (it.winProbability / 100);
                return (
                  <tr
                    key={it.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-1 pr-3 text-xs">{it.title}</td>
                    <td className={cx("py-1 pr-3 text-xs font-medium", stageClass(it.stage))}>
                      {l(`profit.pipeline.stage.${it.stage}`)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(it.amountTotal)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {it.winProbability.toFixed(0)}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono text-xs">
                      {eur.format(weighted)}
                    </td>
                    <td className="py-1 pr-3 font-mono text-xs">
                      {it.expectedStartDate.slice(0, 10)}
                    </td>
                    <td className="py-1 pr-3 text-xs">
                      {it.owner?.displayName ?? "—"}
                    </td>
                    <td className="py-1 pr-3 text-right">
                      <div className="flex justify-end gap-1">
                        {it.stage !== "WON" ? (
                          <button
                            type="button"
                            onClick={() => void quickStage(it, "WON")}
                            disabled={!canEdit || submitting}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                            title={l("profit.pipeline.action.win")}
                          >
                            ✓
                          </button>
                        ) : null}
                        {it.stage !== "LOST" ? (
                          <button
                            type="button"
                            onClick={() => void quickStage(it, "LOST")}
                            disabled={!canEdit || submitting}
                            className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-500/30 dark:bg-slate-700/40 dark:text-slate-300"
                            title={l("profit.pipeline.action.lose")}
                          >
                            ✕
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => startEdit(it)}
                          disabled={!canEdit}
                          className="rounded-lg border border-black/10 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-slate-800"
                        >
                          {l("profit.pipeline.action.update")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(it.id)}
                          disabled={!canEdit || submitting}
                          className="rounded-lg border border-red-300 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400"
                        >
                          {l("profit.pipeline.action.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Forecast tables */}
      {forecast ? (
        <div className="mt-5 grid gap-5">
          <div>
            <h4 className="mb-2 text-sm font-semibold">
              {l("profit.pipeline.forecast.heading")} —{" "}
              {l(`profit.pipeline.scenario.${scenario}`)} ·{" "}
              {l(`profit.pipeline.range.${range}`)}
            </h4>
            <p className="mb-2 text-xs text-slate-500">
              {l("profit.pipeline.forecast.subtitle")}
            </p>
            {forecast.buckets.length === 0 ? (
              <p className="text-sm text-slate-500">{l("profit.pipeline.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                      <th className="py-2 pr-3">{l("profit.pipeline.forecast.col.period")}</th>
                      <th className="py-2 pr-3 text-right">{l("profit.pipeline.forecast.col.total")}</th>
                      <th className="py-2 pr-3 text-right">{l("profit.pipeline.forecast.col.weighted")}</th>
                      <th className="py-2 pr-3 text-right">{l("profit.pipeline.forecast.col.itemCount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.buckets.map((b) => (
                      <tr
                        key={b.periodRef}
                        className="border-b border-black/5 last:border-0 dark:border-white/5"
                      >
                        <td className="py-1 pr-3 font-mono text-xs">{b.periodRef}</td>
                        <td className="py-1 pr-3 text-right font-mono text-xs">
                          {eur.format(b.totalAmount)}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-xs">
                          {eur.format(b.weightedAmount)}
                        </td>
                        <td className="py-1 pr-3 text-right font-mono text-xs">
                          {b.itemCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">
              {l("profit.pipeline.byStage.heading")}
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                    <th className="py-2 pr-3">{l("profit.pipeline.byStage.col.stage")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.pipeline.byStage.col.itemCount")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.pipeline.byStage.col.totalAmount")}</th>
                    <th className="py-2 pr-3 text-right">{l("profit.pipeline.byStage.col.weightedAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.byStage.map((s) => (
                    <tr
                      key={s.stage}
                      className="border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className={cx("py-1 pr-3 text-xs font-medium", stageClass(s.stage))}>
                        {l(`profit.pipeline.stage.${s.stage}`)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono text-xs">
                        {s.itemCount}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono text-xs">
                        {eur.format(s.totalAmount)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono text-xs">
                        {eur.format(s.weightedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function stageClass(stage: PipelineStage) {
  if (stage === "WON") return "text-emerald-700 dark:text-emerald-400";
  if (stage === "LOST") return "text-slate-500 dark:text-slate-400";
  if (stage === "NEGOTIATION") return "text-blue-700 dark:text-blue-400";
  if (stage === "OFFERED") return "text-amber-700 dark:text-amber-400";
  return "text-slate-600 dark:text-slate-300";
}
