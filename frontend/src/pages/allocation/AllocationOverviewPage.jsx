import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Database,
  Gauge,
  GitCompare,
  Layers,
  PlayCircle,
  PlugZap,
  Sparkles,
  Sun,
  Users,
  Warehouse,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import AllocationPageHeader from "../../components/allocation/AllocationPageHeader";
import AllocationToolbar from "../../components/allocation/AllocationToolbar";
import MethodBadge from "../../components/allocation/MethodBadge";
import MethodComparisonChart from "../../components/allocation/MethodComparisonChart";
import NoAllocationState from "../../components/allocation/NoAllocationState";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import { useAuth } from "../../context/AuthContext";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import { METHOD_ORDER, RUN_STATUS_LABELS, RUN_STATUS_VARIANTS } from "../../lib/allocation";
import {
  formatCapacity,
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcShortDate,
} from "../../lib/formatters";
import {
  getApartmentAllocation,
  getAllocationDaily,
  getAllocationRuns,
  getComparison,
} from "../../services/allocationService";

export default function AllocationOverviewPage() {
  const { isAdmin, user } = useAuth();
  const {
    runId,
    selectedRun,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
    runsError,
    refresh,
    residentFlat,
  } = useAllocation();

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);

  const comparison = useApiData(
    () =>
      getComparison({
        simulation_run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
        source: "auto",
      }),
    [runId, dateFrom, dateTo],
    { enabled: isAdmin && ready }
  );

  const savedRuns = useApiData(
    () => getAllocationRuns({ simulation_run_id: runId, limit: 5 }),
    [runId],
    { enabled: isAdmin && Boolean(runId) }
  );

  const apartment = useApiData(
    () =>
      residentFlat
        ? getApartmentAllocation(residentFlat, {
            simulation_run_id: runId,
            date_from: dateFrom,
            date_to: dateTo,
          })
        : null,
    [residentFlat, runId, dateFrom, dateTo],
    { enabled: !isAdmin && Boolean(residentFlat && ready) }
  );

  const daily = useApiData(
    () =>
      residentFlat
        ? getAllocationDaily({
            simulation_run_id: runId,
            flat_id: residentFlat,
            date_from: dateFrom,
            date_to: dateTo,
            limit: 1000,
          })
        : null,
    [residentFlat, runId, dateFrom, dateTo],
    { enabled: !isAdmin && Boolean(residentFlat && ready) }
  );

  function refreshAll() {
    refresh();
    comparison.reload();
    savedRuns.reload();
    apartment.reload();
    daily.reload();
  }

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Solar allocation"
          icon={Gauge}
          title="Allocation overview"
          description="Fair-share solar allocation derived from stored SolarTwin readings."
        />
        <NoAllocationState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={Gauge}
        title={isAdmin ? "Allocation overview" : "My solar allocation"}
        description={
          isAdmin
            ? "Preview or inspect how stored solar is shared across the 60 apartments. Every figure is calculated from actual SolarTwin readings in PostgreSQL."
            : "Your apartment's share of stored rooftop solar, calculated by the administrator's saved allocation run."
        }
        actions={
          <>
            <Badge variant="success" dot>
              <Database size={11} /> {isAdmin ? "Backend calculated" : "Scoped to your flat"}
            </Badge>
            {isAdmin ? (
              <>
                <Link to="/allocation/run">
                  <Button size="sm">
                    <PlayCircle size={13} />
                    Run allocation
                  </Button>
                </Link>
                <Link to="/allocation/compare">
                  <Button variant="outline" size="sm">
                    <GitCompare size={13} />
                    Compare
                  </Button>
                </Link>
              </>
            ) : null}
          </>
        }
      />

      {runsError ? (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="SolarTwin runs unavailable"
              message={runsError}
              onRetry={refresh}
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <AllocationToolbar onRefresh={refreshAll} refreshing={comparison.loading || apartment.loading} />

          {isAdmin ? (
            <AdminOverview
              comparison={comparison}
              savedRuns={savedRuns}
              selectedRun={selectedRun}
              onRefresh={refreshAll}
            />
          ) : (
            <ResidentOverview
              user={user}
              residentFlat={residentFlat}
              apartment={apartment}
              daily={daily}
              onRefresh={refreshAll}
            />
          )}
        </>
      )}
    </div>
  );
}

function AdminOverview({ comparison, savedRuns, selectedRun, onRefresh }) {
  const data = comparison.data;
  const methodResults = data?.methods || [];
  const baseTotals = methodResults[0]?.totals || data?.method_totals?.[METHOD_ORDER[0]];
  const apartments = data?.apartments || [];

  if (comparison.loading && !data) {
    return (
      <div className="space-y-4">
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
      </div>
    );
  }

  if (comparison.error) {
    return (
      <Card>
        <CardBody className="pt-5">
          <ErrorState
            title="Allocation overview unavailable"
            message={comparison.error}
            onRetry={comparison.reload}
          />
        </CardBody>
      </Card>
    );
  }

  if (!data) {
    return <NoAllocationState />;
  }

  const splitData = [
    { label: "Common solar", value: baseTotals?.common_solar_consumption_kwh || 0, color: "#94a3b8" },
    { label: "Apartment solar", value: baseTotals?.total_allocated_kwh || 0, color: "#2d744c" },
    { label: "Surplus", value: baseTotals?.surplus_kwh || 0, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Solar generation"
          value={formatEnergy(baseTotals?.total_solar_generation_kwh)}
          detail={`${formatCapacity(selectedRun?.solar_capacity_kwp)} installed · ${data.apartments_compared} flats`}
          icon={Sun}
          tone="forest"
        />
        <StatCard
          label="Common-area solar"
          value={formatEnergy(baseTotals?.common_solar_consumption_kwh)}
          detail="Consumed first, before apartments"
          icon={Warehouse}
          tone="sky"
        />
        <StatCard
          label="Available to apartments"
          value={formatEnergy(baseTotals?.available_for_apartments_kwh)}
          detail="After common-area demand"
          icon={Layers}
          tone="slate"
        />
        <StatCard
          label="Allocated to flats"
          value={formatEnergy(baseTotals?.total_allocated_kwh)}
          detail={`${formatPercent(baseTotals?.solar_utilization_percentage)} of generation used on site`}
          icon={Building2}
          tone="emerald"
        />
        <StatCard
          label="Apartment consumption"
          value={formatEnergy(baseTotals?.total_apartment_consumption_kwh)}
          detail={`${formatPercent(baseTotals?.apartment_solar_coverage_percentage)} covered by solar`}
          icon={Users}
          tone="forest"
        />
        <StatCard
          label="Grid import"
          value={formatEnergy(baseTotals?.grid_import_kwh)}
          detail="Consumption not served by solar"
          icon={PlugZap}
          tone="amber"
        />
        <StatCard
          label="Surplus solar"
          value={formatEnergy(baseTotals?.surplus_kwh)}
          detail="Generated but not consumed on site"
          icon={Sparkles}
          tone="sky"
        />
        <StatCard
          label="Average coverage"
          value={formatPercent(baseTotals?.average_coverage_percentage)}
          detail={`Tariff ₹${formatNumber(baseTotals?.tariff_price_per_kwh, 2)}/kWh`}
          icon={Gauge}
          tone="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Where the solar went"
            description={`Energy split for ${formatUtcDate(data.date_from)} – ${formatUtcDate(data.date_to)}. Common areas are served first.`}
            icon={Sun}
            action={
              <Badge variant={data.source === "saved" ? "success" : "info"} dot>
                {data.source === "saved" ? "Saved runs" : "Live preview"}
              </Badge>
            }
          />
          <CardBody>
            <div className="space-y-3">
              {splitData.map((row) => {
                const total = baseTotals?.total_solar_generation_kwh || 0;
                const share = total ? (row.value / total) * 100 : 0;
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex items-center gap-2 text-slate-600">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.label}
                      </span>
                      <span className="font-medium text-slate-900">
                        {formatEnergy(row.value, 2)} · {formatPercent(share)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, share))}%`,
                          backgroundColor: row.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <MiniFact label="Algorithm version" value={savedRuns.data?.items?.[0]?.algorithm_version || "1.0.0"} />
              <MiniFact label="Method" value={methodResults[0]?.method_label || "—"} />
              <MiniFact label="Apartments" value={formatNumber(data.apartments_compared)} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Latest saved runs"
            description="Immutable allocation snapshots for this simulation run."
            icon={Database}
            action={
              <Link to="/allocation/history">
                <Button variant="ghost" size="sm">
                  History <ArrowRight size={12} />
                </Button>
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {savedRuns.loading ? (
              Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))
            ) : savedRuns.error ? (
              <p className="text-xs text-rose-600">{savedRuns.error}</p>
            ) : !savedRuns.data?.items?.length ? (
              <p className="text-xs text-slate-500">
                No allocation run has been saved for this simulation yet.
              </p>
            ) : (
              savedRuns.data.items.map((run) => (
                <div
                  key={run.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        Run #{run.id}
                      </span>
                      <MethodBadge method={run.method} />
                    </div>
                    <Badge variant={RUN_STATUS_VARIANTS[run.status] || "neutral"}>
                      {RUN_STATUS_LABELS[run.status] || run.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatEnergy(run.total_allocated_kwh, 1)} allocated ·{" "}
                    {formatPercent(run.average_coverage_percentage)} avg coverage
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {formatDateTime(run.created_at)}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <MethodComparisonChart
        comparison={data}
        loading={comparison.loading}
        error={comparison.error}
        onRetry={comparison.reload}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Method snapshot"
            description={data.fairness_comparison?.note}
            icon={GitCompare}
          />
          <CardBody className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Method</th>
                    <th className="px-3 py-2 text-right font-semibold">Allocated</th>
                    <th className="px-3 py-2 text-right font-semibold">Surplus</th>
                    <th className="px-3 py-2 text-right font-semibold">Avg coverage</th>
                    <th className="px-3 py-2 text-right font-semibold">Coverage range</th>
                    <th className="px-5 py-2 text-right font-semibold">Jain</th>
                  </tr>
                </thead>
                <tbody>
                  {methodResults.map((result) => {
                    const fairness = data.fairness_comparison || {};
                    return (
                      <tr key={result.method} className="border-t border-slate-100">
                        <td className="px-5 py-2.5">
                          <MethodBadge method={result.method} />
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700">
                          {formatNumber(result.totals.total_allocated_kwh, 1)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500">
                          {formatNumber(result.totals.surplus_kwh, 1)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700">
                          {formatPercent(fairness.average_coverage_percentage?.[result.method])}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500">
                          {formatPercent(fairness.minimum_coverage_percentage?.[result.method])} –{" "}
                          {formatPercent(fairness.maximum_coverage_percentage?.[result.method])}
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold text-slate-900">
                          {result.fairness.jain_index == null
                            ? "—"
                            : result.fairness.jain_index.toFixed(4)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Run details"
            description="All three methods use identical inputs."
            icon={CalendarDays}
          />
          <CardBody className="space-y-0">
            <DetailRow label="Simulation run">#{data.simulation_run_id}</DetailRow>
            <DetailRow label="Period">
              {formatUtcDate(data.date_from)} – {formatUtcDate(data.date_to)}
            </DetailRow>
            <DetailRow label="Source">
              {data.source === "saved" ? "Saved allocation runs" : "Calculated preview"}
            </DetailRow>
            <DetailRow label="Tariff">
              ₹{formatNumber(data.tariff_price_per_kwh, 2)}/kWh
            </DetailRow>
            <DetailRow label="Hypothetical">
              {data.is_hypothetical ? "Yes (not saved)" : "No"}
            </DetailRow>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Apartment comparison"
          description={`${formatNumber(apartments.length)} flats compared across all three methods.`}
          icon={Building2}
        />
        <CardBody className="px-0 pb-0">
          <div className="max-h-[26rem] overflow-auto scrollbar-thin">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-semibold">Flat</th>
                  <th className="px-3 py-2 text-right font-semibold">Consumption</th>
                  {METHOD_ORDER.map((method) => (
                    <th key={method} className="px-3 py-2 text-right font-semibold">
                      {method === "EQUAL_SHARE" ? "Equal" : method === "CONSUMPTION_BASED" ? "Consumption" : "Ownership"} kWh
                    </th>
                  ))}
                  <th className="px-5 py-2 text-right font-semibold">Spread</th>
                </tr>
              </thead>
              <tbody>
                {apartments.map((row) => (
                  <tr key={row.apartment_id} className="border-t border-slate-100">
                    <td className="px-5 py-2 font-medium text-slate-800">
                      {row.flat_number}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatNumber(row.consumption_kwh, 1)}
                    </td>
                    {METHOD_ORDER.map((method) => (
                      <td key={method} className="px-3 py-2 text-right text-slate-700">
                        {formatNumber(row.methods?.[method]?.allocated_kwh, 2)}
                      </td>
                    ))}
                    <td className="px-5 py-2 text-right font-semibold text-slate-900">
                      {formatNumber(row.allocation_spread_kwh, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
          Live previews are recalculated from stored readings and never persisted.
          Saved runs are immutable audit snapshots; saving an identical request returns
          the existing run instead of creating a duplicate.
        </p>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh overview
        </Button>
      </div>
    </div>
  );
}

function ResidentOverview({ user, residentFlat, apartment, daily, onRefresh }) {
  const data = apartment.data;
  const summary = data?.summary;
  const dailyItems = daily.data?.items || [];
  const chartData = dailyItems.map((item) => ({
    period: item.period,
    consumption: item.consumption_kwh,
    solar: item.allocated_solar_kwh,
    grid: item.grid_import_kwh,
  }));

  if (!residentFlat) {
    return (
      <Card>
        <CardBody className="pt-5">
          <EmptyState
            icon={Building2}
            title="No apartment linked to your account"
            description={
              user?.role === "RESIDENT"
                ? "Ask an administrator to link your resident account to a flat. Allocation records are scoped to the linked apartment."
                : "No flat reference is available for this account."
            }
          />
        </CardBody>
      </Card>
    );
  }

  if (apartment.loading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index}>
            <CardBody className="space-y-2 pt-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-36" />
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  if (apartment.error) {
    return (
      <Card>
        <CardBody className="pt-5">
          <ErrorState
            title="Your allocation is unavailable"
            message={apartment.error}
            onRetry={apartment.reload}
          />
        </CardBody>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardBody className="pt-5">
          <EmptyState
            icon={Sun}
            title="Waiting for allocation data"
            description="An administrator must save an allocation run for the selected SolarTwin period before your flat's figures appear. The page will retry when the run and date range are available."
            action={
              <Button variant="outline" size="sm" onClick={onRefresh}>
                Check again
              </Button>
            }
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
              Allocated flat
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {data.apartment.flat_number} · {data.apartment.apartment_category}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {data.apartment.residents_count} residents · {data.apartment.consumption_profile} profile
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MethodBadge method={data.method} />
            <Badge variant={data.saved ? "success" : "info"} dot>
              {data.saved ? `Saved run #${data.allocation_run_id}` : "Preview only"}
            </Badge>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Solar allocated"
          value={formatEnergy(summary?.total_solar_allocation_kwh)}
          detail={`Ownership ${formatPercent(summary?.ownership_percentage, 3)}`}
          icon={Sun}
          tone="forest"
        />
        <StatCard
          label="Your consumption"
          value={formatEnergy(summary?.total_consumption_kwh)}
          detail={`${formatPercent(summary?.solar_coverage_percentage)} covered by solar`}
          icon={Building2}
          tone="emerald"
        />
        <StatCard
          label="Grid import"
          value={formatEnergy(summary?.total_grid_import_kwh)}
          detail="Remainder imported from the grid"
          icon={PlugZap}
          tone="amber"
        />
        <StatCard
          label="Estimated solar credit"
          value={`₹${formatNumber(summary?.estimated_solar_credit, 2)}`}
          detail={`At ₹${formatNumber(data.tariff_price_per_kwh, 2)}/kWh`}
          icon={Sparkles}
          tone="sky"
        />
      </div>

      <Card>
        <CardHeader
          title="Daily solar allocation"
          description={`${formatEnergy(summary?.total_solar_allocation_kwh, 1)} allocated across ${formatNumber(apartment.data?.hour_count)} hours.`}
          icon={CalendarDays}
          action={
            <Badge variant="forest">
              {formatPercent(summary?.solar_coverage_percentage)} coverage
            </Badge>
          }
        />
        <CardBody>
          {daily.loading ? (
            <Skeleton className="h-72 w-full" />
          ) : daily.error ? (
            <ErrorState compact message={daily.error} onRetry={daily.reload} />
          ) : !chartData.length ? (
            <EmptyState compact title="No daily records" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickFormatter={formatUtcShortDate}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(value) => formatNumber(value, 0)}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        labelFormatter={(value) => formatUtcDate(value)}
                        valueFormatter={(value) => formatEnergy(value, 2)}
                      />
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="consumption" name="Consumption" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="solar" name="Solar allocation" fill="#2d744c" radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
          These figures come from the administrator's saved allocation for your flat.
          Open Apartment details for hourly and monthly records. You cannot access another
          resident's allocation.
        </p>
        <div className="flex gap-2">
          <Link to="/allocation/apartments">
            <Button variant="outline" size="sm">
              Apartment details <ArrowRight size={12} />
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

function MiniFact({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-800">{value}</p>
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
