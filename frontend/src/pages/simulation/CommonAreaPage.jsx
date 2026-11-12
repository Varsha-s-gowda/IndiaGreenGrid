import { useState } from "react";
import {
  Building,
  CalendarRange,
  PieChart as PieChartIcon,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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
import SimulationTabs from "../../components/simulation/SimulationTabs";
import SimulationToolbar from "../../components/simulation/SimulationToolbar";
import { useSolarTwin } from "../../context/SolarTwinContext";
import useApiData from "../../hooks/useApiData";
import {
  COMMON_CATEGORIES,
  commonCategoryRows,
  commonDailySeries,
  commonHourlySeries,
} from "../../lib/energy";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcHour,
  formatUtcShortDate,
} from "../../lib/formatters";
import {
  getCommonConsumption,
  getSimulationSummary,
} from "../../services/solarTwinService";

export default function CommonAreaPage() {
  const {
    selectedRun,
    runId,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
  } = useSolarTwin();

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);
  const [category, setCategory] = useState("all");

  const common = useApiData(
    () =>
      getCommonConsumption({
        run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    [runId, dateFrom, dateTo],
    { enabled: ready }
  );

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

  const items = common.data?.items || [];
  const categoryRows = commonCategoryRows(summary.data?.common_by_category || {});
  const total = categoryRows.reduce((sum, row) => sum + row.value, 0);

  const selectedCategory =
    COMMON_CATEGORIES.find((row) => row.key === category) || null;
  const filteredItems =
    category === "all"
      ? items
      : items.filter((item) => item.category === category);

  const visibleCategories =
    category === "all"
      ? COMMON_CATEGORIES
      : COMMON_CATEGORIES.filter((row) => row.key === category);

  const hourlySeries = commonHourlySeries(filteredItems);
  const dailySeries = commonDailySeries(filteredItems);
  const pieRows = categoryRows.filter((row) => row.value > 0);

  const loading = common.loading || summary.loading;
  const error = common.error || summary.error;
  const reload = () => {
    common.reload();
    summary.reload();
  };

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="SolarTwin"
          icon={Warehouse}
          title="Common-area analytics"
          description="Lift, pump, corridor and security consumption from stored common-area readings."
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
        icon={Warehouse}
        title="Common-area analytics"
        description="Category totals, hourly demand and daily consumption for lifts, water pumps, corridor lighting and security systems."
        actions={
          <Badge variant="success" dot>
            {formatNumber(common.data?.loaded ?? 0)} common readings
          </Badge>
        }
      />
      <SimulationTabs />

      <SimulationToolbar onRefresh={reload} refreshing={loading} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Common-area total"
          value={formatEnergy(total)}
          detail={`${formatUtcDate(dateFrom)} – ${formatUtcDate(dateTo)}`}
          icon={Warehouse}
          tone="forest"
          loading={loading}
        />
        {categoryRows.map((row) => (
          <StatCard
            key={row.key}
            label={row.label}
            value={formatEnergy(row.value)}
            detail={`${formatPercent(row.share)} of common demand`}
            icon={Building}
            tone={
              row.key === "lifts"
                ? "emerald"
                : row.key === "water_pumps"
                  ? "sky"
                  : row.key === "corridor_lights"
                    ? "amber"
                    : "slate"
            }
            loading={loading}
          />
        ))}
      </div>

      <Card>
        <CardBody className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="min-w-[15rem]">
              <span className="field-label text-xs">Consumption category</span>
              <select
                className="field h-9 text-xs"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">All common-area categories</option>
                {COMMON_CATEGORIES.map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="max-w-xl pb-1 text-[11px] leading-5 text-slate-500">
              {selectedCategory
                ? selectedCategory.description
                : "Category totals come from /api/simulation/summary; hourly and daily series are filtered from the stored common-area readings."}
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartPanel
          title="Percentage contribution"
          description="Share of common-area consumption by category."
          icon={PieChartIcon}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          empty={!pieRows.length}
          height="h-64"
        >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieRows}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={86}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {pieRows.map((row) => (
                      <Cell key={row.key} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={
                      <ChartTooltip
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.label}
                        valueFormatter={(value, entry) =>
                          `${formatEnergy(value, 1)} · ${formatPercent(
                            entry?.payload?.share ?? 0
                          )}`
                        }
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 space-y-2">
              {categoryRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 text-[11px]"
                >
                  <span className="inline-flex items-center gap-2 text-slate-600">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.label}
                  </span>
                  <span className="font-medium text-slate-900">
                    {formatPercent(row.share)}
                  </span>
                </div>
              ))}
            </div>
          </ChartPanel>

        <ChartPanel
          className="lg:col-span-2"
          title="Hourly common-area consumption"
          description={`${formatNumber(hourlySeries.length)} hourly buckets · ${
            selectedCategory ? selectedCategory.label : "all categories"
          } · UTC.`}
          icon={TrendingUp}
          loading={common.loading}
          error={common.error}
          onRetry={common.reload}
          empty={!hourlySeries.length}
          height="h-80"
        >
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="reading_time"
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
                  width={44}
                  tickFormatter={(value) => formatNumber(value, 1)}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(value) => formatUtcHour(value)}
                      valueFormatter={(value) => formatEnergy(value, 2)}
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {visibleCategories.map((row) => (
                  <Line
                    key={row.key}
                    type="monotone"
                    dataKey={row.key}
                    name={row.label}
                    stroke={row.color}
                    strokeWidth={1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      </div>

      <ChartPanel
        title="Daily common-area consumption"
        description={`Stacked daily totals split by category · ${
          selectedCategory ? selectedCategory.label : "all categories"
        }.`}
        icon={CalendarRange}
        loading={common.loading}
        error={common.error}
        onRetry={common.reload}
        empty={!dailySeries.length}
        height="h-80"
      >
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                    valueFormatter={(value) => formatEnergy(value, 2)}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {visibleCategories.map((row) => (
                <Bar
                  key={row.key}
                  dataKey={row.key}
                  name={row.label}
                  stackId="common"
                  fill={row.color}
                  maxBarSize={26}
                />
              ))}
              <Line
                type="monotone"
                dataKey="total"
                name="Daily total"
                stroke="#1f4a33"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>

      <Card>
        <CardBody className="pt-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {categoryRows.map((row) => (
              <div key={row.key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">{row.label}</p>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                </div>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatEnergy(row.value)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {formatPercent(row.share)} of common demand
                </p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
