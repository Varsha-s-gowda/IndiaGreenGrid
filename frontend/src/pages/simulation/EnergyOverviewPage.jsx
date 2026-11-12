import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Database,
  Gauge,
  Layers,
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
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import ChartPanel from "../../components/simulation/ChartPanel";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import NoSimulationState from "../../components/simulation/NoSimulationState";
import SimulationTabs from "../../components/simulation/SimulationTabs";
import SimulationToolbar from "../../components/simulation/SimulationToolbar";
import { useAuth } from "../../context/AuthContext";
import { useSolarTwin } from "../../context/SolarTwinContext";
import useApiData from "../../hooks/useApiData";
import { commonCategoryRows, round, sumItems } from "../../lib/energy";
import {
  formatCapacity,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcShortDate,
} from "../../lib/formatters";
import {
  getDailyBalance,
  getSimulationSummary,
} from "../../services/solarTwinService";

export default function EnergyOverviewPage() {
  const { isAdmin } = useAuth();
  const {
    selectedRun,
    runId,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
    runsError,
    refresh,
    apartmentSummary,
  } = useSolarTwin();

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);

  const summary = useApiData(
    () =>
      getSimulationSummary({
        run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    [runId, dateFrom, dateTo],
    { enabled: ready }
  );

  const daily = useApiData(
    () =>
      getDailyBalance({
        run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    [runId, dateFrom, dateTo],
    { enabled: ready }
  );

  const balance = summary.data?.energy_balance || null;
  const commonRows = commonCategoryRows(summary.data?.common_by_category || {});
  const dailyItems = daily.data?.items || [];

  const dailyChart = dailyItems.map((item) => ({
    period: item.period,
    solar: item.total_solar_generation_kwh,
    demand: item.total_building_demand_kwh,
    grid: item.grid_import_kwh,
  }));

  const totalCommon = sumItems(commonRows, (row) => row.value);

  function refreshAll() {
    refresh();
    summary.reload();
    daily.reload();
  }

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="SolarTwin"
          icon={Gauge}
          title="Energy overview"
          description="Stored solar generation, apartment demand and common-area consumption for the selected simulation run."
        />
        <SimulationTabs />
        <NoSimulationState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SolarTwin"
        icon={Gauge}
        title="Energy overview"
        description="Every metric below is calculated from stored PostgreSQL simulation readings for the selected run and date range."
        actions={
          <>
            <Badge variant="success" dot>
              <Database size={11} /> Stored readings
            </Badge>
            {isAdmin && (
              <Link to="/simulation/control">
                <Button variant="outline" size="sm">
                  Simulation control
                  <ArrowRight size={13} />
                </Button>
              </Link>
            )}
          </>
        }
      />
      <SimulationTabs />

      {runsError ? (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Simulation runs unavailable"
              message={runsError}
              onRetry={refresh}
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <SimulationToolbar onRefresh={refreshAll} refreshing={summary.loading || daily.loading} />

          {summary.loading && !balance ? (
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
          ) : summary.error ? (
            <Card>
              <CardBody className="pt-5">
                <ErrorState
                  title="Energy summary unavailable"
                  message={summary.error}
                  onRetry={summary.reload}
                />
              </CardBody>
            </Card>
          ) : balance ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Solar generation"
                value={formatEnergy(balance.total_solar_generation_kwh)}
                detail={`${formatCapacity(selectedRun?.solar_capacity_kwp)} installed capacity`}
                icon={Sun}
                tone="forest"
              />
              <StatCard
                label="Apartment consumption"
                value={formatEnergy(balance.total_apartment_consumption_kwh)}
                detail={`${formatPercent(balance.apartment_solar_coverage_percentage)} covered by solar`}
                icon={Building2}
                tone="emerald"
              />
              <StatCard
                label="Common-area consumption"
                value={formatEnergy(balance.total_common_consumption_kwh)}
                detail={`${formatPercent(balance.common_solar_coverage_percentage)} covered by solar`}
                icon={Warehouse}
                tone="sky"
              />
              <StatCard
                label="Building demand"
                value={formatEnergy(balance.total_building_demand_kwh)}
                detail="Apartments plus common areas"
                icon={Layers}
                tone="slate"
              />
              <StatCard
                label="Grid import"
                value={formatEnergy(balance.grid_import_kwh)}
                detail={
                  balance.total_building_demand_kwh
                    ? `${formatPercent((balance.grid_import_kwh / balance.total_building_demand_kwh) * 100)} of building demand`
                    : "No building demand in range"
                }
                icon={PlugZap}
                tone="amber"
              />
              <StatCard
                label="Surplus solar"
                value={formatEnergy(balance.surplus_solar_kwh)}
                detail={
                  balance.total_solar_generation_kwh
                    ? `${formatPercent((balance.surplus_solar_kwh / balance.total_solar_generation_kwh) * 100)} of generation`
                    : "No generation in range"
                }
                icon={Sparkles}
                tone="sky"
              />
              <StatCard
                label="Solar utilization"
                value={formatPercent(balance.solar_utilization_percentage)}
                detail={`${formatEnergy(balance.total_solar_utilized_kwh)} used on site`}
                icon={Gauge}
                tone="forest"
              />
              <StatCard
                label="Apartments"
                value={formatNumber(apartmentSummary?.total_apartments ?? 0)}
                detail={
                  apartmentSummary
                    ? `${formatNumber(apartmentSummary.total_residents)} residents tracked`
                    : "Apartment inventory"
                }
                icon={Users}
                tone="emerald"
              />
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartPanel
              className="lg:col-span-2"
              title="Daily solar generation and building demand"
              description="Daily totals from /api/simulation/daily for the selected date range."
              icon={Sun}
              loading={daily.loading}
              error={daily.error}
              onRetry={daily.reload}
              empty={!dailyChart.length}
              emptyTitle="No daily balance in this range"
              height="h-80"
            >
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                      width={48}
                      tickFormatter={(value) => formatNumber(value, 0)}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          labelFormatter={(value) => formatUtcDate(value)}
                          valueFormatter={(value) => formatEnergy(value, 1)}
                        />
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar
                      dataKey="solar"
                      name="Solar generation"
                      fill="#2d744c"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="demand"
                      name="Building demand"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>

            <Card>
              <CardHeader
                title="Run summary"
                description={`Run #${selectedRun?.id} · ${selectedRun?.days} days`}
                icon={Database}
                action={
                  <Badge variant={selectedRun?.status === "COMPLETED" ? "success" : "warning"} dot>
                    {selectedRun?.status}
                  </Badge>
                }
              />
              <CardBody className="space-y-0">
                <DetailRow label="Period">
                  {formatUtcDate(selectedRun?.start_date)} –{" "}
                  {formatUtcDate(selectedRun?.end_date)}
                </DetailRow>
                <DetailRow label="Capacity">
                  {formatCapacity(selectedRun?.solar_capacity_kwp)}
                </DetailRow>
                <DetailRow label="Random seed">{selectedRun?.random_seed}</DetailRow>
                <DetailRow label="Solar readings">
                  {formatNumber(summary.data?.record_counts?.solar_records ?? 0)}
                </DetailRow>
                <DetailRow label="Meter readings">
                  {formatNumber(summary.data?.record_counts?.meter_records ?? 0)}
                </DetailRow>
                <DetailRow label="Common readings">
                  {formatNumber(summary.data?.record_counts?.common_records ?? 0)}
                </DetailRow>
                <div className="pt-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Generation progress</span>
                    <span className="font-semibold text-slate-800">
                      {formatPercent(selectedRun?.progress_percentage, 1)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-forest-600"
                      style={{ width: `${Math.min(100, selectedRun?.progress_percentage || 0)}%` }}
                    />
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Common-area consumption by category"
              description={`Filtered category totals from /api/simulation/summary · ${formatEnergy(totalCommon)} total`}
              icon={Warehouse}
            />
            <CardBody>
              {summary.loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-8 w-full" />
                  ))}
                </div>
              ) : commonRows.every((row) => row.value === 0) ? (
                <p className="text-xs text-slate-500">
                  No common-area readings in the selected date range.
                </p>
              ) : (
                <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {commonRows.map((row) => (
                    <div key={row.key}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="inline-flex items-center gap-2 text-slate-600">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          {row.label}
                        </span>
                        <span className="font-medium text-slate-900">
                          {formatEnergy(row.value)} · {formatPercent(row.share)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.share)}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
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
