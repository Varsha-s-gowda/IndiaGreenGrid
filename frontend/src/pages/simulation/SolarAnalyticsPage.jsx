import { useState } from "react";
import {
  Clock3,
  Gauge,
  LineChart as LineChartIcon,
  Sun,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import { Card, CardBody } from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import ChartPanel from "../../components/simulation/ChartPanel";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import NoSimulationState from "../../components/simulation/NoSimulationState";
import SegmentedControl from "../../components/simulation/SegmentedControl";
import SimulationTabs from "../../components/simulation/SimulationTabs";
import SimulationToolbar from "../../components/simulation/SimulationToolbar";
import { useSolarTwin } from "../../context/SolarTwinContext";
import useApiData from "../../hooks/useApiData";
import {
  groupRowsByWeek,
  hourlyAverageProfile,
  round,
  sumItems,
} from "../../lib/energy";
import {
  formatCapacity,
  formatEnergy,
  formatNumber,
  formatUtcDate,
  formatUtcHour,
  formatUtcShortDate,
} from "../../lib/formatters";
import {
  getDailyBalance,
  getMonthlyBalance,
  getSolarGeneration,
} from "../../services/solarTwinService";

const VIEW_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export default function SolarAnalyticsPage() {
  const {
    selectedRun,
    runId,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
  } = useSolarTwin();

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);
  const [view, setView] = useState("daily");

  const solar = useApiData(
    () =>
      getSolarGeneration({
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

  const monthly = useApiData(
    () =>
      getMonthlyBalance({
        run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    [runId, dateFrom, dateTo],
    { enabled: ready }
  );

  const readings = solar.data?.items || [];
  const totalGeneration = sumItems(readings, (item) => item.generation_kwh);
  const peakReading = readings.reduce((best, item) => {
    if (!best) return item;
    return item.generation_kwh > best.generation_kwh ? item : best;
  }, null);

  const dailyItems = daily.data?.items || [];
  const monthlyItems = monthly.data?.items || [];
  const averageDaily = dailyItems.length
    ? sumItems(dailyItems, (item) => item.total_solar_generation_kwh) /
      dailyItems.length
    : 0;

  const dailyTrend = dailyItems.map((item) => ({
    period: item.period,
    generation: item.total_solar_generation_kwh,
  }));
  const weeklyTrend = groupRowsByWeek(dailyItems).map((item) => ({
    period: item.period,
    generation: item.total_solar_generation_kwh,
  }));
  const monthlyTrend = monthlyItems.map((item) => ({
    period: item.period,
    generation: item.total_solar_generation_kwh,
  }));

  const trendData =
    view === "weekly"
      ? weeklyTrend
      : view === "monthly"
        ? monthlyTrend
        : dailyTrend;

  const hourlyData = readings.map((item) => ({
    time: item.reading_time,
    generation: item.generation_kwh,
    weather: item.weather_factor,
  }));

  const hourlyProfile = hourlyAverageProfile(
    readings,
    (item) => item.generation_kwh
  );

  const trendLoading =
    view === "monthly" ? monthly.loading : daily.loading;
  const trendError = view === "monthly" ? monthly.error : daily.error;
  const trendReload = view === "monthly" ? monthly.reload : daily.reload;

  function refreshAll() {
    solar.reload();
    daily.reload();
    monthly.reload();
  }

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="SolarTwin"
          icon={Sun}
          title="Solar generation analytics"
          description="Hourly, daily and monthly generation from the stored SolarTwin readings."
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
        icon={Sun}
        title="Solar generation analytics"
        description="Actual hourly generation, daily totals and monthly trends read from /api/simulation/solar-generation and the balance endpoints."
        actions={
          <Badge variant="success" dot>
            {formatNumber(solar.data?.loaded ?? 0)} hourly readings
          </Badge>
        }
      />
      <SimulationTabs />

      <SimulationToolbar
        onRefresh={refreshAll}
        refreshing={solar.loading || daily.loading || monthly.loading}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Installed capacity"
          value={formatCapacity(selectedRun?.solar_capacity_kwp)}
          detail={`Run #${selectedRun?.id} · seed ${selectedRun?.random_seed}`}
          icon={Gauge}
          tone="forest"
          loading={runsLoading}
        />
        <StatCard
          label="Total generation"
          value={formatEnergy(totalGeneration)}
          detail={`${formatNumber(readings.length)} hourly readings in range`}
          icon={Zap}
          tone="emerald"
          loading={solar.loading}
        />
        <StatCard
          label="Peak generation"
          value={peakReading ? formatEnergy(peakReading.generation_kwh) : "—"}
          detail={
            peakReading
              ? `${formatUtcHour(peakReading.reading_time)} · weather ${formatNumber(
                  peakReading.weather_factor,
                  2
                )}`
              : "No generation in range"
          }
          icon={TrendingUp}
          tone="sky"
          loading={solar.loading}
        />
        <StatCard
          label="Average daily generation"
          value={formatEnergy(averageDaily)}
          detail={`${formatNumber(dailyItems.length)} days in range`}
          icon={Clock3}
          tone="amber"
          loading={daily.loading}
        />
      </div>

      <ChartPanel
        title="Hourly solar generation"
        description={`Every stored hourly reading for ${formatUtcDate(dateFrom)} – ${formatUtcDate(dateTo)}. Times are UTC.`}
        icon={LineChartIcon}
        loading={solar.loading}
        error={solar.error}
        onRetry={solar.reload}
        empty={!hourlyData.length}
        height="h-80"
      >
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(value) => formatUtcHour(value)}
                tickLine={false}
                axisLine={false}
                minTickGap={44}
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
                    labelFormatter={(value) => formatUtcHour(value)}
                    valueFormatter={(value) => formatEnergy(value, 2)}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="generation"
                name="Generation"
                stroke="#2d744c"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: "#255d3e" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Generation trend"
          description={
            view === "monthly"
              ? "Monthly totals from /api/simulation/monthly."
              : view === "weekly"
                ? "Weekly totals aggregated from /api/simulation/daily."
                : "Daily totals from /api/simulation/daily."
          }
          icon={TrendingUp}
          loading={trendLoading}
          error={trendError}
          onRetry={trendReload}
          empty={!trendData.length}
          height="h-72"
          action={
            <SegmentedControl
              label="Generation trend granularity"
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
            />
          }
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(value) =>
                    view === "monthly" ? value : formatUtcShortDate(value)
                  }
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
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
                      labelFormatter={(value) =>
                        view === "monthly" ? value : formatUtcDate(value)
                      }
                      valueFormatter={(value) => formatEnergy(value, 2)}
                    />
                  }
                />
                <Bar
                  dataKey="generation"
                  name="Generation"
                  fill="#3d8f60"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>

        <ChartPanel
          title="Average output by hour of day"
          description="Average hourly generation across the selected days (UTC). Derived from stored readings."
          icon={Clock3}
          loading={solar.loading}
          error={solar.error}
          onRetry={solar.reload}
          empty={!hourlyProfile.some((item) => item.value > 0)}
          height="h-72"
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyProfile} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value) => formatNumber(value, 1)}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(value) => `${value} UTC`}
                      valueFormatter={(value) => formatEnergy(value, 2)}
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  name="Average generation"
                  fill="#96cca9"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      </div>

      <Card>
        <CardBody className="pt-5">
          <p className="text-xs leading-6 text-slate-500">
            All values on this page come from the stored hourly solar readings and the
            server-side daily and monthly balance endpoints. Peak time and hourly averages are
            computed in UTC, matching the backend&apos;s aggregation periods. No values are
            randomised or hardcoded in the frontend.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
