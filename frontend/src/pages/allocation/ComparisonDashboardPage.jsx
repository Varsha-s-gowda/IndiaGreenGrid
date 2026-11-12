import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Database,
  FlaskConical,
  GitCompare,
  Layers,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  Sun,
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
import MethodBadge from "../../components/allocation/MethodBadge";
import MethodComparisonChart from "../../components/allocation/MethodComparisonChart";
import SegmentedControl from "../../components/simulation/SegmentedControl";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import {
  METHOD_ORDER,
  formatHash,
  methodLabel,
} from "../../lib/allocation";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { getComparison } from "../../services/allocationService";

const SOURCE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "preview", label: "Live preview" },
  { value: "saved", label: "Saved runs" },
];

const SOURCE_COPY = {
  auto: "Uses the latest saved run for each method when all three exist on identical inputs; otherwise the backend recalculates a live preview.",
  preview: "Recalculates all three methods now. Nothing is persisted and saved runs are never altered.",
  saved: "Reads the latest immutable saved run for each method. Fails if any method is missing for this simulation and date range.",
};

export default function ComparisonDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const runIdsParam = searchParams.get("runs") || "";
  const savedRunIds = runIdsParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const [source, setSource] = useState("auto");
  const ready = savedRunIds.length
    ? true
    : Boolean(runId && dateFrom && dateTo && rangeValid);

  const comparison = useApiData(
    () =>
      getComparison(
        savedRunIds.length
          ? { allocation_run_ids: runIdsParam }
          : {
              simulation_run_id: runId,
              date_from: dateFrom,
              date_to: dateTo,
              source,
            }
      ),
    [runIdsParam, runId, dateFrom, dateTo, source],
    { enabled: ready }
  );

  const data = comparison.data;
  const methods = data?.methods || [];
  const baseTotals = methods[0]?.totals;

  function refreshAll() {
    refresh();
    comparison.reload();
  }

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={GitCompare}
        title="Comparison dashboard"
        description="Compare equal-share, consumption-based and ownership-based allocation on exactly the same SolarTwin inputs, dates, ownership ledger and tariff."
        actions={
          <>
            <Badge variant="forest" dot>
              <ShieldAlert size={11} /> Identical inputs enforced
            </Badge>
            <Link to="/allocation/what-if">
              <Button variant="outline" size="sm">
                <FlaskConical size={13} /> What-if simulator
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
        <AllocationToolbar onRefresh={refreshAll} refreshing={comparison.loading} />
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Comparison source
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
              {savedRunIds.length
                ? `Inspecting a historical saved set: allocation runs ${savedRunIds.map((id) => `#${id}`).join(", ")}. The backend validates that simulation, dates, consumption, solar and tariff are identical.`
                : SOURCE_COPY[source]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {savedRunIds.length ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSearchParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.delete("runs");
                      return next;
                    },
                    { replace: true }
                  )
                }
              >
                Exit historical set
              </Button>
            ) : (
              <SegmentedControl
                label="Comparison source"
                options={SOURCE_OPTIONS}
                value={source}
                onChange={setSource}
                size="md"
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={comparison.reload}
              loading={comparison.loading}
              disabled={!ready}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        </CardBody>
      </Card>

      {!ready && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Select a valid period"
              message="Choose a SolarTwin simulation run and a valid date range before comparing methods."
              compact
            />
          </CardBody>
        </Card>
      )}

      {ready && comparison.loading && !data && (
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

      {ready && comparison.error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Comparison unavailable"
              message={comparison.error}
              onRetry={comparison.reload}
              action={
                source === "saved" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSource("auto")}
                  >
                    Use auto instead
                  </Button>
                ) : undefined
              }
            />
            {source === "saved" && (
              <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
                A saved comparison needs one immutable run for each method with the
                same simulation, date range, consumption, solar and tariff. Save the
                missing methods from the run workspace first.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Solar generation"
              value={formatEnergy(baseTotals?.total_solar_generation_kwh)}
              detail={`${formatNumber(data.apartments_compared)} apartments compared`}
              icon={Sun}
              tone="forest"
            />
            <StatCard
              label="Available to apartments"
              value={formatEnergy(baseTotals?.available_for_apartments_kwh)}
              detail={`Common solar ${formatEnergy(baseTotals?.common_solar_consumption_kwh)} served first`}
              icon={Layers}
              tone="sky"
            />
            <StatCard
              label="Apartment consumption"
              value={formatEnergy(baseTotals?.total_apartment_consumption_kwh)}
              detail={`${formatPercent(baseTotals?.apartment_solar_coverage_percentage)} covered by solar`}
              icon={Building2}
              tone="emerald"
            />
            <StatCard
              label="Basis"
              value={data.source === "saved" ? "Saved runs" : "Live preview"}
              detail={`Tariff ₹${formatNumber(data.tariff_price_per_kwh, 2)}/kWh · ${data.is_hypothetical ? "hypothetical" : "actual inputs"}`}
              icon={Database}
              tone="slate"
            />
          </div>

          <Card>
            <CardHeader
              title="Method comparison"
              description={`${formatUtcDate(data.date_from)} – ${formatUtcDate(data.date_to)} · simulation run #${data.simulation_run_id}. Every method uses the same inputs.`}
              icon={GitCompare}
              action={
                <Badge variant={data.source === "saved" ? "success" : "info"} dot>
                  {data.source === "saved" ? "Saved snapshots" : "Preview"}
                </Badge>
              }
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
                      <th className="px-3 py-2.5 text-right font-semibold">Range</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Jain</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Saved run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METHOD_ORDER.map((key) => {
                      const result = methods.find((item) => item.method === key);
                      if (!result) return null;
                      const savedRunId = data.saved_run_ids?.[key];
                      return (
                        <tr key={key} className="border-t border-slate-100">
                          <td className="px-5 py-3">
                            <MethodBadge method={key} />
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-slate-800">
                            {formatNumber(result.totals.total_allocated_kwh, 2)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600">
                            {formatNumber(result.totals.surplus_kwh, 2)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-600">
                            {formatNumber(result.totals.grid_import_kwh, 1)}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-700">
                            {formatPercent(
                              data.fairness_comparison?.average_coverage_percentage?.[key]
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-500">
                            {formatPercent(
                              data.fairness_comparison?.minimum_coverage_percentage?.[key]
                            )}{" "}
                            –{" "}
                            {formatPercent(
                              data.fairness_comparison?.maximum_coverage_percentage?.[key]
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">
                            {result.fairness.jain_index == null
                              ? "N/A"
                              : result.fairness.jain_index.toFixed(4)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {savedRunId ? (
                              <Link
                                to={`/allocation/history?run=${savedRunId}`}
                                className="font-medium text-forest-700 hover:underline"
                              >
                                #{savedRunId}
                              </Link>
                            ) : (
                              <span className="text-slate-400">Preview</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 px-5 py-3">
                <p className="text-[11px] leading-5 text-slate-500">
                  {data.fairness_comparison?.note}
                </p>
              </div>
            </CardBody>
          </Card>

          <MethodComparisonChart
            comparison={data}
            loading={comparison.loading}
            error={comparison.error}
            onRetry={comparison.reload}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Per-apartment differences"
                description="Allocation spread is the difference between the largest and smallest method result for each flat. It is a comparison aid, not a fairness verdict."
                icon={Building2}
                action={
                  <Link to="/allocation/fairness">
                    <Button variant="ghost" size="sm">
                      Fairness detail <ArrowRight size={12} />
                    </Button>
                  </Link>
                }
              />
              <CardBody className="px-0 pb-0">
                <ApartmentAllocationTable
                  rows={data.apartments}
                  mode="compare"
                  compact
                  linkToApartment
                  emptyTitle="No apartment comparison rows"
                />
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader
                  title="Input identity"
                  description="The backend rejects saved comparisons that mix inputs."
                  icon={ShieldAlert}
                />
                <CardBody className="space-y-0">
                  <DetailRow label="Simulation run">
                    #{data.simulation_run_id}
                  </DetailRow>
                  <DetailRow label="Period">
                    {formatUtcDate(data.date_from)} – {formatUtcDate(data.date_to)}
                  </DetailRow>
                  <DetailRow label="Apartments">
                    {formatNumber(data.apartments_compared)}
                  </DetailRow>
                  <DetailRow label="Tariff">
                    ₹{formatNumber(data.tariff_price_per_kwh, 2)}/kWh
                  </DetailRow>
                  <DetailRow label="Hypothetical">
                    {data.is_hypothetical ? "Yes (preview only)" : "No"}
                  </DetailRow>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="How to read this"
                  description="Comparison exposes trade-offs, not a winner."
                  icon={Scale}
                />
                <CardBody>
                  <ul className="space-y-2">
                    {(data.concepts || []).map((concept) => (
                      <li
                        key={concept}
                        className="flex items-start gap-2 text-[11px] leading-5 text-slate-600"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest-500" />
                        {concept}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
                    A higher Jain index means more even coverage percentages. It does
                    not make a policy legally or ethically fairer than another.
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Warnings"
                  description="Returned by the backend for this comparison."
                  icon={Sparkles}
                />
                <CardBody>
                  {data.warnings?.length ? (
                    <ul className="space-y-2">
                      {data.warnings.map((warning) => (
                        <li
                          key={warning}
                          className="text-[11px] leading-5 text-slate-600"
                        >
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      No warnings were returned for this comparison.
                    </p>
                  )}
                  {data.source === "preview" && (
                    <p className="mt-3 text-[11px] leading-5 text-slate-500">
                      Previews are never persisted. Save each method separately if you
                      need an auditable snapshot.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
              {methods
                .map(
                  (item) =>
                    `${methodLabel(item.method)}: ${formatHash(item.input_hash)}`
                )
                .join(" · ")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/allocation/run">
                <Button variant="secondary" size="sm">
                  Run & save a method
                </Button>
              </Link>
              <Link to="/allocation/what-if">
                <Button variant="outline" size="sm">
                  Test a what-if <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
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
