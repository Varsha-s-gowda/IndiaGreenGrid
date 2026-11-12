import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  FlaskConical,
  GitCompare,
  Info,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import AllocationPageHeader from "../../components/allocation/AllocationPageHeader";
import AllocationToolbar from "../../components/allocation/AllocationToolbar";
import ApartmentAllocationTable from "../../components/allocation/ApartmentAllocationTable";
import FairnessDetail from "../../components/allocation/FairnessDetail";
import MethodBadge from "../../components/allocation/MethodBadge";
import SegmentedControl from "../../components/simulation/SegmentedControl";
import { getApiErrorMessage } from "../../lib/apiError";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import { METHOD_ORDER, methodLabel } from "../../lib/allocation";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import {
  getComparison,
  postComparison,
} from "../../services/allocationService";

const MULTIPLIER_PRESETS = [0.5, 0.75, 1, 1.25, 1.5];

export default function WhatIfSimulatorPage() {
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

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);

  const [solarMultiplier, setSolarMultiplier] = useState("1");
  const [demandMultiplier, setDemandMultiplier] = useState("1");
  const [overrides, setOverrides] = useState([]);
  const [newFlat, setNewFlat] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("EQUAL_SHARE");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  const baseline = useApiData(
    () =>
      getComparison({
        simulation_run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
        source: "auto",
      }),
    [runId, dateFrom, dateTo],
    { enabled: ready }
  );

  const ownershipByFlat = useMemo(() => {
    const map = new Map();
    (baseline.data?.apartments || []).forEach((apartment) => {
      map.set(apartment.flat_number, apartment.ownership_percentage);
    });
    return map;
  }, [baseline.data]);

  useEffect(() => {
    if (!baseline.data?.apartments?.length) return;
    setNewFlat((current) => {
      if (current && ownershipByFlat.has(current)) return current;
      const available = baseline.data.apartments.find(
        (apartment) => !overrides.some((row) => row.flat === apartment.flat_number)
      );
      return available?.flat_number || "";
    });
  }, [baseline.data, ownershipByFlat, overrides]);

  useEffect(() => {
    const methods = result?.methods || baseline.data?.methods || [];
    if (!methods.length) return;
    if (!methods.some((item) => item.method === selectedMethod)) {
      setSelectedMethod(methods[0].method);
    }
  }, [result, baseline.data, selectedMethod]);

  const availableFlats = (baseline.data?.apartments || []).filter(
    (apartment) => !overrides.some((row) => row.flat === apartment.flat_number)
  );

  const overrideTotals = useMemo(() => {
    const original = overrides.reduce(
      (sum, row) => sum + (ownershipByFlat.get(row.flat) || 0),
      0
    );
    const next = overrides.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0);
    const effective = 100 - original + next;
    const valid =
      overrides.length === 0 ||
      (overrides.every(
        (row) =>
          Number.isFinite(Number(row.percentage)) &&
          Number(row.percentage) >= 0 &&
          Number(row.percentage) <= 100
      ) &&
        Math.abs(effective - 100) <= 0.001);
    return { original, next, effective, valid };
  }, [overrides, ownershipByFlat]);

  const solarValue = Number(solarMultiplier);
  const demandValue = Number(demandMultiplier);
  const multipliersValid =
    Number.isFinite(solarValue) &&
    solarValue >= 0 &&
    solarValue <= 10 &&
    Number.isFinite(demandValue) &&
    demandValue >= 0 &&
    demandValue <= 10;

  const scenarioActive =
    solarValue !== 1 || demandValue !== 1 || overrides.length > 0;

  function addOverride() {
    if (!newFlat || overrides.some((row) => row.flat === newFlat)) return;
    setOverrides((current) => [
      ...current,
      {
        flat: newFlat,
        percentage: String(ownershipByFlat.get(newFlat) ?? ""),
      },
    ]);
    setResult(null);
  }

  function updateOverride(flat, percentage) {
    setOverrides((current) =>
      current.map((row) => (row.flat === flat ? { ...row, percentage } : row))
    );
    setResult(null);
  }

  function removeOverride(flat) {
    setOverrides((current) => current.filter((row) => row.flat !== flat));
    setResult(null);
  }

  function resetScenario() {
    setSolarMultiplier("1");
    setDemandMultiplier("1");
    setOverrides([]);
    setResult(null);
    setError("");
    setValidationError("");
  }

  async function runScenario() {
    setValidationError("");
    setError("");
    if (!multipliersValid) {
      setValidationError("Multipliers must be between 0 and 10.");
      return;
    }
    if (!overrideTotals.valid) {
      setValidationError(
        "Hypothetical ownership must stay non-negative and total exactly 100.000%."
      );
      return;
    }
    const overridePayload = overrides.length
      ? Object.fromEntries(
          overrides.map((row) => [row.flat, Number(row.percentage)])
        )
      : undefined;

    setLoading(true);
    try {
      const data = await postComparison({
        simulation_run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
        solar_multiplier: solarValue,
        demand_multiplier: demandValue,
        ownership_overrides: overridePayload,
        hypothetical: true,
      });
      setResult(data);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to calculate this what-if scenario.")
      );
    } finally {
      setLoading(false);
    }
  }

  function refreshAll() {
    refresh();
    baseline.reload();
  }

  const methods = result?.methods || baseline.data?.methods || [];
  const methodResult =
    methods.find((item) => item.method === selectedMethod) || methods[0] || null;
  const baselineMethod =
    baseline.data?.methods?.find((item) => item.method === selectedMethod) || null;

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={FlaskConical}
        title="What-if simulator"
        description="Explore hypothetical solar generation, apartment demand and ownership changes. The backend recalculates all three methods for the scenario and never persists anything."
        actions={
          <>
            <Badge variant="warning" dot>
              <ShieldAlert size={11} /> Preview only
            </Badge>
            <Link to="/allocation/compare">
              <Button variant="outline" size="sm">
                <GitCompare size={13} /> Real comparison
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
        <AllocationToolbar
          onRefresh={refreshAll}
          refreshing={baseline.loading || loading}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Scenario inputs"
            description="Multipliers are applied to every complete hour in memory. No SolarTwin reading is modified."
            icon={TrendingUp}
          />
          <CardBody className="space-y-5">
            <MultiplierField
              label="Solar generation multiplier"
              description="Simulate more or less rooftop solar without changing the stored simulation."
              value={solarMultiplier}
              onChange={(value) => {
                setSolarMultiplier(value);
                setResult(null);
              }}
            />
            <MultiplierField
              label="Apartment demand multiplier"
              description="Simulate higher or lower household consumption for every apartment."
              value={demandMultiplier}
              onChange={(value) => {
                setDemandMultiplier(value);
                setResult(null);
              }}
            />

            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
              <p>
                Baseline: simulation run #{runId} · {formatUtcDate(dateFrom)} –{" "}
                {formatUtcDate(dateTo)}
              </p>
              <p className="mt-0.5">
                What-if changes exist only in this browser request. Saved allocation
                runs are never overwritten.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Hypothetical ownership"
            description="Optional. Overridden flats replace their ledger share; the effective total must remain 100.000%."
            icon={Building2}
          />
          <CardBody className="space-y-3">
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="field-label text-xs">Flat to override</span>
                <select
                  className="field h-9 w-full text-xs"
                  value={newFlat}
                  onChange={(event) => setNewFlat(event.target.value)}
                  disabled={!availableFlats.length || baseline.loading}
                >
                  {availableFlats.length ? (
                    availableFlats.map((apartment) => (
                      <option key={apartment.flat_number} value={apartment.flat_number}>
                        {apartment.flat_number} · {formatPercent(apartment.ownership_percentage, 3)}
                      </option>
                    ))
                  ) : (
                    <option value="">All flats overridden</option>
                  )}
                </select>
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={addOverride}
                disabled={!newFlat || !availableFlats.length}
              >
                <Plus size={13} /> Add
              </Button>
            </div>

            {!overrides.length ? (
              <p className="text-[11px] leading-5 text-slate-500">
                No ownership overrides. The stored ownership ledger is used unchanged.
              </p>
            ) : (
              <div className="space-y-2">
                {overrides.map((row) => (
                  <div key={row.flat} className="flex items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="field-label text-[10px]">{row.flat}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.001"
                        className="field h-9 w-full text-xs"
                        value={row.percentage}
                        onChange={(event) =>
                          updateOverride(row.flat, event.target.value)
                        }
                      />
                    </label>
                    <span className="pb-2 text-[10px] text-slate-400">
                      was {formatPercent(ownershipByFlat.get(row.flat), 3)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeOverride(row.flat)}
                      aria-label={`Remove override for ${row.flat}`}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`rounded-lg border px-3 py-2.5 text-[11px] leading-5 ${
                overrideTotals.valid
                  ? "border-slate-100 bg-slate-50 text-slate-600"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span>Effective ownership total</span>
                <span className="font-semibold">
                  {formatNumber(overrideTotals.effective, 3)}%
                </span>
              </div>
              <p className="mt-0.5">
                {overrides.length
                  ? overrideTotals.valid
                    ? "Valid: the effective ledger still totals 100.000%."
                    : "Invalid: adjust the overridden shares so the effective total is 100.000%."
                  : "The unchanged ledger totals 100.000%."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={runScenario}
                loading={loading}
                disabled={!ready || !multipliersValid || !overrideTotals.valid}
              >
                <Sparkles size={13} /> Simulate what-if
              </Button>
              <Button variant="ghost" size="sm" onClick={resetScenario}>
                <RotateCcw size={13} /> Reset
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {validationError && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState compact title="Check the scenario" message={validationError} />
          </CardBody>
        </Card>
      )}

      {error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="What-if simulation failed"
              message={error}
              onRetry={runScenario}
            />
          </CardBody>
        </Card>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
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

      {!result && !loading && (
        <Card>
          <CardBody className="pt-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-sky-50 text-sky-700">
                <Info size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {baseline.loading
                    ? "Loading the baseline comparison…"
                    : scenarioActive
                      ? "Scenario ready to simulate"
                      : "Adjust a multiplier or ownership share"}
                </p>
                <p className="mt-1 text-xs leading-6 text-slate-600">
                  The simulator calls the backend comparison endpoint with{" "}
                  <span className="font-mono">hypothetical=true</span>. The response is
                  rendered in memory only. There is no save action on this page, so a
                  what-if can never become a billing or allocation record.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {result && (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning" dot>
                  Hypothetical scenario
                </Badge>
                <Badge variant="info">Not saved</Badge>
                <span className="text-[11px] text-slate-500">
                  Solar × {formatNumber(solarValue, 2)} · Demand ×{" "}
                  {formatNumber(demandValue, 2)} · {overrides.length} ownership
                  override{overrides.length === 1 ? "" : "s"}
                </span>
              </div>
              <SegmentedControl
                label="Scenario method"
                options={METHOD_ORDER.map((key) => ({
                  value: key,
                  label: methodLabel(key),
                }))}
                value={selectedMethod}
                onChange={setSelectedMethod}
                size="md"
              />
            </CardBody>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Scenario allocated solar"
              value={formatEnergy(methodResult?.totals.total_allocated_kwh)}
              detail={`Baseline ${formatEnergy(baselineMethod?.totals.total_allocated_kwh)}`}
              icon={Sparkles}
              tone="forest"
            />
            <StatCard
              label="Scenario avg coverage"
              value={formatPercent(methodResult?.fairness.average_coverage_percentage)}
              detail={`Baseline ${formatPercent(baselineMethod?.fairness.average_coverage_percentage)}`}
              icon={TrendingUp}
              tone="emerald"
            />
            <StatCard
              label="Scenario Jain index"
              value={
                methodResult?.fairness.jain_index == null
                  ? "N/A"
                  : methodResult.fairness.jain_index.toFixed(4)
              }
              detail={`Baseline ${
                baselineMethod?.fairness.jain_index == null
                  ? "N/A"
                  : baselineMethod.fairness.jain_index.toFixed(4)
              }`}
              icon={GitCompare}
              tone="sky"
            />
            <StatCard
              label="Scenario surplus"
              value={formatEnergy(methodResult?.totals.surplus_kwh)}
              detail={`Grid import ${formatEnergy(methodResult?.totals.grid_import_kwh)}`}
              icon={ShieldAlert}
              tone="amber"
            />
          </div>

          <Card>
            <CardHeader
              title="Scenario method comparison"
              description="All three methods recalculated on the hypothetical inputs. Nothing is persisted."
              icon={GitCompare}
            />
            <CardBody className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">Method</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Allocated</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Surplus</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Grid import</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Avg coverage</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Jain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METHOD_ORDER.map((key) => {
                      const item = result.methods.find(
                        (entry) => entry.method === key
                      );
                      if (!item) return null;
                      return (
                        <tr key={key} className="border-t border-slate-100">
                          <td className="px-5 py-3">
                            <MethodBadge method={key} />
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-slate-800">
                            {formatNumber(item.totals.total_allocated_kwh, 2)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600">
                            {formatNumber(item.totals.surplus_kwh, 2)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600">
                            {formatNumber(item.totals.grid_import_kwh, 1)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-700">
                            {formatPercent(item.fairness.average_coverage_percentage)}
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-900">
                            {item.fairness.jain_index == null
                              ? "N/A"
                              : item.fairness.jain_index.toFixed(4)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {methodResult && (
            <FairnessDetail
              fairness={methodResult.fairness}
              methodLabel={methodResult.method_label}
            />
          )}

          <Card>
            <CardHeader
              title="Scenario apartment comparison"
              description={`${formatNumber(result.apartments_compared)} flats under the hypothetical inputs.`}
              icon={Building2}
              action={
                <Link to="/allocation/run">
                  <Button variant="secondary" size="sm">
                    Run a real method <ArrowRight size={12} />
                  </Button>
                </Link>
              }
            />
            <CardBody className="px-0 pb-0">
              <ApartmentAllocationTable
                rows={result.apartments}
                mode="compare"
                compact
                linkToApartment
                emptyTitle="No apartment rows in this scenario"
              />
            </CardBody>
          </Card>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
          What-if scenarios are memory-only. Saving any active scenario through the
          allocation API returns HTTP 400 by design, and this page exposes no save
          action.
        </p>
        <Badge variant="neutral">No billing or allocation rows created</Badge>
      </div>
    </div>
  );
}

function MultiplierField({ label, description, value, onChange }) {
  const numeric = Number(value);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="min-w-0 flex-1">
          <span className="field-label text-xs">{label}</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.05"
            className="field h-9 w-32 text-xs"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {MULTIPLIER_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(String(preset))}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                numeric === preset
                  ? "border-forest-200 bg-forest-50 text-forest-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              ×{preset}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>
    </div>
  );
}
