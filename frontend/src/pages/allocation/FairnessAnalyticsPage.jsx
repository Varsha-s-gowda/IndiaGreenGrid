import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Database,
  GitCompare,
  RefreshCw,
  Scale,
  Sparkles,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import AllocationPageHeader from "../../components/allocation/AllocationPageHeader";
import AllocationToolbar from "../../components/allocation/AllocationToolbar";
import FairnessDetail from "../../components/allocation/FairnessDetail";
import MethodBadge from "../../components/allocation/MethodBadge";
import SegmentedControl from "../../components/simulation/SegmentedControl";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import { METHOD_ORDER, methodLabel } from "../../lib/allocation";
import {
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import {
  getAllocationRuns,
  getFairness,
} from "../../services/allocationService";

const MODE_OPTIONS = [
  { value: "preview", label: "Live preview" },
  { value: "saved", label: "Saved run" },
];

export default function FairnessAnalyticsPage() {
  const {
    runId,
    selectedRun,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
    runsError,
    refresh,
  } = useAllocation();

  const [mode, setMode] = useState("preview");
  const [selectedMethod, setSelectedMethod] = useState("EQUAL_SHARE");
  const [savedRunId, setSavedRunId] = useState("");

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);

  const savedRuns = useApiData(
    () => getAllocationRuns({ simulation_run_id: runId, limit: 100 }),
    [runId],
    { enabled: Boolean(runId) }
  );

  useEffect(() => {
    const items = savedRuns.data?.items || [];
    if (!items.length) {
      setSavedRunId("");
      return;
    }
    setSavedRunId((current) =>
      items.some((item) => String(item.id) === String(current))
        ? current
        : String(items[0].id)
    );
  }, [savedRuns.data]);

  const fairness = useApiData(
    () =>
      mode === "saved"
        ? getFairness({ allocation_run_id: Number(savedRunId) })
        : getFairness({
            simulation_run_id: runId,
            date_from: dateFrom,
            date_to: dateTo,
          }),
    [mode, savedRunId, runId, dateFrom, dateTo],
    { enabled: ready && (mode !== "saved" || Boolean(savedRunId)) }
  );

  const methods = fairness.data?.methods || [];

  useEffect(() => {
    if (!methods.length) return;
    if (!methods.some((item) => item.method === selectedMethod)) {
      setSelectedMethod(methods[0].method);
    }
  }, [methods, selectedMethod]);

  const selected = useMemo(
    () =>
      methods.find((item) => item.method === selectedMethod) || methods[0] || null,
    [methods, selectedMethod]
  );

  function refreshAll() {
    refresh();
    savedRuns.reload();
    fairness.reload();
  }

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={Sparkles}
        title="Fairness analytics"
        description="Coverage spread, Jain's index, allocation variance and estimated savings across apartments. All metrics are calculated by the Python fairness engine from actual allocation records."
        actions={
          <>
            <Badge variant="forest" dot>
              <Scale size={11} /> No universal fairest method
            </Badge>
            <Link to="/allocation/compare">
              <Button variant="outline" size="sm">
                <GitCompare size={13} /> Compare methods
              </Button>
            </Link>
          </>
        }
      />

      {runsError && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="SolarTwin runs unavailable"
              message={runsError}
              onRetry={refresh}
            />
          </CardBody>
        </Card>
      )}

      {selectedRun && (
        <AllocationToolbar onRefresh={refreshAll} refreshing={fairness.loading} />
      )}

      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Fairness source
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              {mode === "saved"
                ? "Reads apartment summaries from one immutable saved allocation run."
                : "Recalculates all three methods on the selected SolarTwin period. Nothing is persisted."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <SegmentedControl
              label="Fairness source"
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
              size="md"
            />
            {mode === "saved" && (
              <label>
                <span className="field-label text-xs">Saved allocation run</span>
                <select
                  className="field h-9 w-64 text-xs"
                  value={savedRunId}
                  onChange={(event) => setSavedRunId(event.target.value)}
                  disabled={savedRuns.loading || !(savedRuns.data?.items || []).length}
                >
                  {(savedRuns.data?.items || []).length ? (
                    savedRuns.data.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        Run #{item.id} · {item.method_label} · {item.date_from} to{" "}
                        {item.date_to}
                      </option>
                    ))
                  ) : (
                    <option value="">No saved runs</option>
                  )}
                </select>
              </label>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fairness.reload}
              loading={fairness.loading}
              disabled={!ready || (mode === "saved" && !savedRunId)}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        </CardBody>
      </Card>

      {mode === "saved" && !savedRuns.loading && !(savedRuns.data?.items || []).length && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="No saved allocation runs"
              message="Save an allocation run first, or switch to the live preview to inspect fairness before saving."
              compact
            />
          </CardBody>
        </Card>
      )}

      {!ready && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Select a valid period"
              message="Choose a SolarTwin simulation run and a valid date range before reading fairness metrics."
              compact
            />
          </CardBody>
        </Card>
      )}

      {ready && fairness.loading && !fairness.data && (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index}>
              <CardBody className="space-y-2 pt-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-40" />
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {ready && fairness.error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Fairness metrics unavailable"
              message={fairness.error}
              onRetry={fairness.reload}
            />
          </CardBody>
        </Card>
      )}

      {fairness.data && selected && (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                {methods.length > 1 ? (
                  <SegmentedControl
                    label="Method"
                    options={methods.map((item) => ({
                      value: item.method,
                      label: item.method_label,
                    }))}
                    value={selectedMethod}
                    onChange={setSelectedMethod}
                    size="md"
                  />
                ) : (
                  <MethodBadge method={selected.method} />
                )}
                <Badge variant={fairness.data.saved ? "success" : "info"} dot>
                  {fairness.data.saved
                    ? `Saved run #${fairness.data.allocation_run_id}`
                    : "Preview only"}
                </Badge>
                {fairness.data.selected_method && (
                  <span className="text-[11px] text-slate-500">
                    {methodLabel(fairness.data.selected_method)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {formatUtcDate(fairness.data.date_from)} –{" "}
                {formatUtcDate(fairness.data.date_to)} · simulation run #
                {fairness.data.simulation_run_id}
              </p>
            </CardBody>
          </Card>

          {methods.length > 1 && (
            <Card>
              <CardHeader
                title="Fairness across methods"
                description={fairness.data.comparison?.note}
                icon={BarChart3}
              />
              <CardBody className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                      <tr>
                        <th className="px-5 py-2.5 font-semibold">Method</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Jain index</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Avg coverage</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Min – max</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Coverage variance</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Allocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {METHOD_ORDER.map((key) => {
                        const result = methods.find((item) => item.method === key);
                        if (!result) return null;
                        const metric = result.fairness;
                        return (
                          <tr
                            key={key}
                            className={`border-t border-slate-100 ${
                              key === selected.method ? "bg-forest-50/40" : ""
                            }`}
                          >
                            <td className="px-5 py-3">
                              <MethodBadge method={key} />
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-900">
                              {metric.jain_index == null
                                ? "N/A"
                                : metric.jain_index.toFixed(4)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-700">
                              {formatPercent(metric.average_coverage_percentage)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {formatPercent(metric.minimum_coverage_percentage)} –{" "}
                              {formatPercent(metric.maximum_coverage_percentage)}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {formatNumber(metric.coverage_variance, 3)}
                            </td>
                            <td className="px-5 py-3 text-right text-slate-700">
                              {formatNumber(result.totals.total_allocated_kwh, 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}

          <FairnessDetail
            fairness={selected.fairness}
            methodLabel={selected.method_label}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Run identity"
                description="Every metric belongs to exactly one method and one input set."
                icon={Database}
              />
              <CardBody className="space-y-0">
                <DetailRow label="Method">{selected.method_label}</DetailRow>
                <DetailRow label="Source">
                  {fairness.data.saved ? "Saved allocation run" : "Live preview"}
                </DetailRow>
                <DetailRow label="Saved run">
                  {fairness.data.allocation_run_id
                    ? `#${fairness.data.allocation_run_id}`
                    : "Not saved"}
                </DetailRow>
                <DetailRow label="Simulation run">
                  #{fairness.data.simulation_run_id}
                </DetailRow>
                <DetailRow label="Period">
                  {formatUtcDate(fairness.data.date_from)} –{" "}
                  {formatUtcDate(fairness.data.date_to)}
                </DetailRow>
                <DetailRow label="Apartments">
                  {formatNumber(selected.fairness.apartment_count)}
                </DetailRow>
                <DetailRow label="Positive demand">
                  {formatNumber(selected.fairness.positive_demand_apartments)}
                </DetailRow>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Metric definition"
                description="How this page calculates fairness."
                icon={Scale}
              />
              <CardBody>
                <p className="text-xs leading-6 text-slate-600">
                  {selected.fairness.metric_definition}
                </p>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
                  <p className="font-medium text-slate-700">Jain's index</p>
                  <p className="mt-1 font-mono">(Σx)² / (n · Σx²)</p>
                  <p className="mt-1">
                    x is each apartment's solar coverage percentage, and n counts
                    apartments with positive demand. 1.0 means perfectly even coverage;
                    lower values mean wider dispersion.
                  </p>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">
                  {selected.fairness.interpretation}
                </p>
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
          Fairness metrics describe the distribution produced by a chosen method. They
          do not decide which policy a society should adopt; that remains a documented
          governance decision.
        </p>
        <Link to="/allocation/methods">
          <Button variant="outline" size="sm">
            Read method caveats
          </Button>
        </Link>
      </div>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-xs last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}
