"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n-context";
import type { Project, Worker, TeamItem, Customer, CustomerFinancials, ProjectFinancials, TimesheetItem } from "../types";
import { cx, SectionCard, SecondaryButton, MiniStat, FormRow, SelectField } from "../shared";
import { TimesheetList, FinancialKpi } from "../projects";

export function ReportsSection({
  customers,
  projects,
  workers,
  apiFetch,
}: {
  customers: Customer[];
  projects: Project[];
  workers: Worker[];
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const { t: l } = useI18n();
  const [customerFinancials, setCustomerFinancials] = useState<Record<string, { totalRevenue: number; totalCosts: number; margin: number; totalHours: number }>>({});
  const [loadingFinancials, setLoadingFinancials] = useState(true);
  const [allTimesheets, setAllTimesheets] = useState<TimesheetItem[]>([]);
  const [tsFilter, setTsFilter] = useState({ customer: "", project: "", worker: "", status: "" });

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoadingFinancials(true);
      const results: Record<string, { totalRevenue: number; totalCosts: number; margin: number; totalHours: number }> = {};
      for (const c of customers) {
        try {
          const f = await apiFetch<{ totalRevenue: number; totalCosts: number; margin: number; totalHours: number }>(`/customers/${c.id}/financials`);
          results[c.id] = f;
        } catch {
          // skip
        }
      }
      if (!cancelled) {
        setCustomerFinancials(results);
        setLoadingFinancials(false);
      }
    }

    void loadAll();
    return () => { cancelled = true; };
  }, [apiFetch, customers]);

  useEffect(() => {
    void apiFetch<TimesheetItem[]>("/timesheets/weekly").then(setAllTimesheets).catch(() => setAllTimesheets([]));
  }, [apiFetch]);

  const filteredTimesheets = allTimesheets.filter((ts) => {
    if (tsFilter.project && ts.project.id !== tsFilter.project) return false;
    if (tsFilter.worker && ts.worker?.id !== tsFilter.worker) return false;
    if (tsFilter.status && ts.status !== tsFilter.status) return false;
    if (tsFilter.customer) {
      const proj = projects.find((p) => p.id === ts.project.id);
      if (proj?.customerId !== tsFilter.customer) return false;
    }
    return true;
  });

  const activeWorkers = workers.filter((w) => w.active !== false);

  // Arbeitsstatus pro Monteur
  function workerIsWorking(w: Worker): boolean {
    return w.timeEntries?.[0]?.entryType === "CLOCK_IN";
  }

  const workingCount = activeWorkers.filter(workerIsWorking).length;

  return (
    <div className="grid gap-6">
      {/* Kennzahlen */}
      <div className="grid gap-4 md:grid-cols-4">
        <MiniStat title={l("dash.activeWorkers")} value={activeWorkers.length} />
        <MiniStat title={l("dash.working")} value={workingCount} />
        <MiniStat title={l("dash.activeProjects")} value={projects.filter((p) => p.status === "ACTIVE").length} />
        <MiniStat title={l("dash.customers")} value={customers.length} />
      </div>

      {/* Umsatzuebersicht pro Kunde */}
      <SectionCard title={l("reports.revenuePerCustomer")} subtitle={l("reports.basedOnHours")}>
        {loadingFinancials ? (
          <p className="text-sm text-slate-500">{l("reports.loadingData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10">
                  <th className="pb-2 pr-3">{l("table.customer")}</th>
                  <th className="pb-2 pr-3 text-right">{l("kpi.hours")}</th>
                  <th className="pb-2 pr-3 text-right">{l("kpi.revenue")}</th>
                  <th className="pb-2 pr-3 text-right">{l("kpi.costs")}</th>
                  <th className="pb-2 text-right">{l("kpi.marginShort")}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const f = customerFinancials[c.id];
                  return (
                    <tr key={c.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                      <td className="py-2 pr-3">
                        <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.companyName}</Link>
                        <div className="text-xs text-slate-500">{c.customerNumber}</div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{f ? `${f.totalHours} h` : "-"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{f ? `${f.totalRevenue.toFixed(2)}` : "-"}</td>
                      <td className="py-2 pr-3 text-right font-mono">{f ? `${f.totalCosts.toFixed(2)}` : "-"}</td>
                      <td className={cx("py-2 text-right font-mono", f && f.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : f ? "text-red-600 dark:text-red-400" : "")}>
                        {f ? `${f.margin.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Monteur-Arbeitsstatus */}
      <SectionCard title={l("dash.workerStatus")} subtitle={l("dash.workerStatusSub")}>
        <div className="grid gap-2">
          {activeWorkers.map((w) => {
            const isWorking = workerIsWorking(w);
            const hasProject = (w.assignments ?? []).length > 0;
            const statusColor = isWorking ? "bg-emerald-500" : hasProject ? "bg-red-500" : "bg-amber-500";
            const statusLabel = isWorking ? l("reports.working") : hasProject ? l("reports.notStarted") : l("reports.noProject");
            return (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-2 dark:border-white/10">
                <div>
                  <span className="font-medium">{w.firstName} {w.lastName}</span>
                  <span className="ml-2 text-sm text-slate-500">{w.workerNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cx("inline-block h-2.5 w-2.5 rounded-full", statusColor)} />
                  <span className="text-xs text-slate-500">{statusLabel}</span>
                  {w.internalHourlyRate != null ? (
                    <span className="ml-2 text-xs font-mono text-slate-400">{w.internalHourlyRate.toFixed(2)} EUR/h</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Stundenzettel zentral ──────────────────────── */}
      <SectionCard title={l("ts.title")} subtitle={l("reports.tsSub")}>
        <div className="mb-4 flex flex-wrap gap-3">
          <SelectField label={l("table.customer")} value={tsFilter.customer} onChange={(e) => setTsFilter((c) => ({ ...c, customer: e.target.value }))}
            options={customers.map((c) => ({ value: c.id, label: c.companyName }))} />
          <SelectField label={l("table.project")} value={tsFilter.project} onChange={(e) => setTsFilter((c) => ({ ...c, project: e.target.value }))}
            options={projects.map((p) => ({ value: p.id, label: `${p.projectNumber} ${p.title}` }))} />
          <SelectField label={l("table.worker")} value={tsFilter.worker} onChange={(e) => setTsFilter((c) => ({ ...c, worker: e.target.value }))}
            options={activeWorkers.map((w) => ({ value: w.id, label: `${w.firstName} ${w.lastName}` }))} />
          <SelectField label={l("table.status")} value={tsFilter.status} onChange={(e) => setTsFilter((c) => ({ ...c, status: e.target.value }))}
            options={[
              { value: "DRAFT", label: l("ts.draft") },
              { value: "WORKER_SIGNED", label: l("ts.workerSigned") },
              { value: "CUSTOMER_SIGNED", label: l("ts.customerSigned") },
              { value: "COMPLETED", label: l("ts.completed") },
              { value: "LOCKED", label: l("ts.locked") },
            ]} />
        </div>
        <TimesheetList timesheets={filteredTimesheets} apiFetch={apiFetch} title={`${filteredTimesheets.length} ${l("ts.title")}`} />
      </SectionCard>
    </div>
  );
}

