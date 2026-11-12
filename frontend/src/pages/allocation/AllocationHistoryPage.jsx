import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Database,
  FileClock,
  GitCompare,
  History,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import AllocationPageHeader from "../../components/allocation/AllocationPageHeader";
import ApartmentAllocationTable from "../../components/allocation/ApartmentAllocationTable";
import MethodBadge from "../../components/allocation/MethodBadge";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import {
  METHOD_ORDER,
  RUN_STATUS_LABELS,
  RUN_STATUS_VARIANTS,
  formatHash,
  methodLabel,
} from "../../lib/allocation";
import {
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import {
  getAllocationRunDetail,
  getAllocationRuns,
} from "../../services/allocationService";

const PAGE_SIZE = 25;

export default function AllocationHistoryPage() {
  const { runs, runId, selectedRun, refresh } = useAllocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRunId = Number(searchParams.get("run")) || null;

  const [simulationFilter, setSimulationFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSimulationFilter(runId ? String(runId) : "");
  }, [runId]);

  useEffect(() => {
    setOffset(0);
  }, [simulationFilter, methodFilter]);

  const history = useApiData(
    () =>
      getAllocationRuns({
        simulation_run_id: simulationFilter || undefined,
        method: methodFilter === "ALL" ? undefined : methodFilter,
        limit: PAGE_SIZE,
        offset,
      }),
    [simulationFilter, methodFilter, offset],
    { enabled: true }
  );

  const detail = useApiData(
    () =>
      selectedRunId ? getAllocationRunDetail(selectedRunId) : Promise.resolve(null),
    [selectedRunId],
    { enabled: Boolean(selectedRunId) }
  );

  const items = history.data?.items || [];
  const total = history.data?.total || 0;

  const comparisonIds = useMemo(() => {
    if (!detail.data) return [];
    const detailMethod = detail.data.method;
    if (!detailMethod) return [];
    const matching = items.filter(
      (run) =>
        run.simulation_run_id === detail.data.simulation_run_id &&
        run.date_from === detail.data.date_from &&
        run.date_to === detail.data.date_to &&
        !run.is_hypothetical
    );
    const byMethod = new Map(matching.map((run) => [run.method, run]));
    if (!METHOD_ORDER.every((method) => byMethod.has(method))) return [];
    return METHOD_ORDER.map((method) => byMethod.get(method).id);
  }, [detail.data, items]);

  async function refreshAll() {
    setRefreshing(true);
    refresh();
    history.reload();
    detail.reload();
    setRefreshing(false);
  }

  function selectRun(id) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("run", String(id));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={History}
        title="Allocation history"
        description="Immutable saved allocation runs. Inspect inputs, totals, fairness metrics and apartment summaries; runs cannot be edited or deleted here."
        actions={
          <>
            <Badge variant="forest" dot>
              <ShieldCheck size={11} /> Immutable audit trail
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              loading={refreshing || history.loading}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-3 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="field-label text-xs">Simulation run</span>
              <select
                className="field h-9 w-56 text-xs"
                value={simulationFilter}
                onChange={(event) => setSimulationFilter(event.target.value)}
              >
                <option value="">All simulation runs</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    Run #{run.id} · {run.start_date} to {run.end_date}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label text-xs">Method</span>
              <select
                className="field h-9 w-44 text-xs"
                value={methodFilter}
                onChange={(event) => setMethodFilter(event.target.value)}
              >
                <option value="ALL">All methods</option>
                {METHOD_ORDER.map((method) => (
                  <option key={method} value={method}>
                    {methodLabel(method)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            {formatNumber(total)} saved run{total === 1 ? "" : "s"}
            {selectedRun ? ` · workspace run #${selectedRun.id}` : ""}
          </p>
        </CardBody>
      </Card>

      {history.error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="History unavailable"
              message={history.error}
              onRetry={history.reload}
            />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Saved runs"
            description="Newest first. Duplicate requests return the existing run instead of inserting a row."
            icon={Database}
          />
          <CardBody className="px-0 pb-0">
            {history.loading && !history.data ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : !items.length ? (
              <div className="px-5 pb-5">
                <EmptyState
                  compact
                  icon={FileClock}
                  title="No saved allocation runs"
                  description="Preview an allocation, then confirm the save from the run workspace."
                  action={
                    <Link to="/allocation/run">
                      <Button size="sm">
                        Open run workspace <ArrowRight size={12} />
                      </Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <>
                <ul className="max-h-[38rem] divide-y divide-slate-100 overflow-auto scrollbar-thin">
                  {items.map((run) => {
                    const active = run.id === selectedRunId;
                    return (
                      <li key={run.id}>
                        <button
                          type="button"
                          onClick={() => selectRun(run.id)}
                          className={`w-full px-5 py-3 text-left transition ${
                            active
                              ? "bg-forest-50/70"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-900">
                                Run #{run.id}
                              </span>
                              <MethodBadge method={run.method} short />
                            </div>
                            <Badge
                              variant={RUN_STATUS_VARIANTS[run.status] || "neutral"}
                            >
                              {RUN_STATUS_LABELS[run.status] || run.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600">
                            {formatEnergy(run.total_allocated_kwh, 2)} allocated ·{" "}
                            {formatPercent(run.average_coverage_percentage)} avg coverage
                          </p>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400">
                            <span>
                              {formatUtcDate(run.date_from)} –{" "}
                              {formatUtcDate(run.date_to)}
                            </span>
                            <span>{formatDateTime(run.created_at)}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                    disabled={offset === 0 || history.loading}
                  >
                    <ArrowLeft size={12} /> Previous
                  </Button>
                  <span className="text-[11px] text-slate-500">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{" "}
                    {formatNumber(total)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((current) => current + PAGE_SIZE)}
                    disabled={offset + PAGE_SIZE >= total || history.loading}
                  >
                    Next <ArrowRight size={12} />
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          {!selectedRunId && (
            <Card>
              <CardBody className="pt-5">
                <EmptyState
                  icon={History}
                  title="Select a saved allocation run"
                  description="Choose a run from the list to inspect its immutable totals, fairness metrics and apartment summaries. Historical runs are never recalculated in place."
                />
              </CardBody>
            </Card>
          )}

          {selectedRunId && detail.loading && !detail.data && (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Card key={index}>
                  <CardBody className="space-y-2 pt-5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-3 w-36" />
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {selectedRunId && detail.error && (
            <Card>
              <CardBody className="pt-5">
                <ErrorState
                  title="Saved run unavailable"
                  message={detail.error}
                  onRetry={detail.reload}
                />
              </CardBody>
            </Card>
          )}

          {detail.data && (
            <>
              <Card>
                <CardBody className="flex flex-wrap items-start justify-between gap-3 pt-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      Saved allocation run
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      Run #{detail.data.run_id} · {detail.data.method_label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Simulation run #{detail.data.simulation_run_id} ·{" "}
                      {formatUtcDate(detail.data.date_from)} –{" "}
                      {formatUtcDate(detail.data.date_to)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <MethodBadge method={detail.data.method} />
                    <Badge
                      variant={RUN_STATUS_VARIANTS[detail.data.status] || "neutral"}
                      dot
                    >
                      {RUN_STATUS_LABELS[detail.data.status] || detail.data.status}
                    </Badge>
                    {detail.data.duplicate && (
                      <Badge variant="info">Duplicate reference</Badge>
                    )}
                  </div>
                </CardBody>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Allocated solar"
                  value={formatEnergy(detail.data.totals.total_allocated_kwh)}
                  detail={`${formatPercent(detail.data.totals.solar_utilization_percentage)} of generation used on site`}
                  icon={Sparkles}
                  tone="forest"
                />
                <StatCard
                  label="Average coverage"
                  value={formatPercent(detail.data.totals.average_coverage_percentage)}
                  detail={`Jain ${detail.data.fairness.jain_index == null ? "N/A" : detail.data.fairness.jain_index.toFixed(4)}`}
                  icon={Layers}
                  tone="emerald"
                />
                <StatCard
                  label="Surplus solar"
                  value={formatEnergy(detail.data.totals.surplus_kwh)}
                  detail="Generated but not consumed on site"
                  icon={CalendarDays}
                  tone="sky"
                />
                <StatCard
                  label="Grid import"
                  value={formatEnergy(detail.data.totals.grid_import_kwh)}
                  detail="Apartment consumption not served by solar"
                  icon={Building2}
                  tone="amber"
                />
              </div>

              <Card>
                <CardHeader
                  title="Audit identity"
                  description="Stored with the run so historical figures can be reproduced."
                  icon={ShieldCheck}
                />
                <CardBody className="space-y-0">
                  <DetailRow label="Algorithm version">
                    {detail.data.algorithm_version}
                  </DetailRow>
                  <DetailRow label="Input hash">
                    <span className="font-mono text-[11px]">
                      {detail.data.input_hash}
                    </span>
                  </DetailRow>
                  <DetailRow label="Created at">
                    {formatDateTime(detail.data.created_at)}
                  </DetailRow>
                  <DetailRow label="Created by">
                    {detail.data.created_by
                      ? `${detail.data.created_by.name} (${detail.data.created_by.email})`
                      : "—"}
                  </DetailRow>
                  <DetailRow label="Hours">
                    {formatNumber(detail.data.hour_count)} complete
                    {detail.data.expected_hour_count
                      ? ` of ${formatNumber(detail.data.expected_hour_count)} expected`
                      : ""}
                  </DetailRow>
                  <DetailRow label="Incomplete data">
                    {detail.data.incomplete_data ? "Yes" : "No"}
                  </DetailRow>
                  {detail.data.policy_note && (
                    <DetailRow label="Documented policy">
                      <span className="text-[11px] leading-5">
                        {detail.data.policy_note}
                      </span>
                    </DetailRow>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Stored warnings"
                  description="Warnings captured when this run was saved."
                  icon={FileClock}
                />
                <CardBody>
                  {detail.data.warnings?.length ? (
                    <ul className="space-y-2">
                      {detail.data.warnings.map((warning) => (
                        <li
                          key={warning}
                          className="flex items-start gap-2 text-[11px] leading-5 text-slate-600"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      No warnings were stored with this run.
                    </p>
                  )}
                  {detail.data.missing_report && (
                    <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600 sm:grid-cols-2">
                      <span>
                        Expected hours:{" "}
                        {formatNumber(detail.data.missing_report.expected_hours)}
                      </span>
                      <span>
                        Complete hours:{" "}
                        {formatNumber(detail.data.missing_report.complete_hours)}
                      </span>
                      <span>
                        Incomplete hours:{" "}
                        {formatNumber(detail.data.missing_report.incomplete_hours)}
                      </span>
                      <span>
                        Missing solar hours:{" "}
                        {formatNumber(detail.data.missing_report.missing_solar_hours)}
                      </span>
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Apartment summaries"
                  description={`${formatNumber(detail.data.apartments.length)} flats stored with this run.`}
                  icon={Building2}
                  action={
                    comparisonIds.length === 3 ? (
                      <Link
                        to={`/allocation/compare?runs=${comparisonIds.join(",")}`}
                      >
                        <Button variant="secondary" size="sm">
                          <GitCompare size={13} /> Compare all three
                        </Button>
                      </Link>
                    ) : (
                      <Badge variant="neutral">
                        {METHOD_ORDER.filter((method) =>
                          items.some(
                            (run) =>
                              run.simulation_run_id === detail.data.simulation_run_id &&
                              run.date_from === detail.data.date_from &&
                              run.date_to === detail.data.date_to &&
                              run.method === method
                          )
                        ).length}
                        /3 methods saved
                      </Badge>
                    )
                  }
                />
                <CardBody className="px-0 pb-0">
                  <ApartmentAllocationTable
                    rows={detail.data.apartments}
                    compact
                    linkToApartment
                    emptyTitle="No apartment summaries stored"
                  />
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
          Historical runs keep the method, dates, algorithm version, input hash and
          stored hourly records. This page never recalculates a saved run, deletes a
          run, or creates a billing record.
        </p>
        <Badge variant="neutral">
          Hash {formatHash(detail.data?.input_hash)}
        </Badge>
      </div>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 text-xs last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}
