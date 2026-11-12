import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Home,
  ListOrdered,
  PieChart as PieChartIcon,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
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
  aggregateByPeriod,
  consumptionByFlat,
  hourlyAverageProfile,
  profileConsumption,
  round,
  sumItems,
  PROFILE_LABELS,
} from "../../lib/energy";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcShortDate,
} from "../../lib/formatters";
import {
  getApartmentConsumption,
  getSimulationSummary,
} from "../../services/solarTwinService";

export default function ApartmentConsumptionPage() {
  const {
    selectedRun,
    runId,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
    apartments,
    apartmentSummary,
    apartmentsLoading,
  } = useSolarTwin();

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);
  const [selectedFlat, setSelectedFlat] = useState("");

  const consumption = useApiData(
    () =>
      getApartmentConsumption({
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

  const items = consumption.data?.items || [];
  const flatRows = consumptionByFlat(items);
  const totalConsumption =
    summary.data?.energy_balance?.total_apartment_consumption_kwh ??
    sumItems(items, (item) => item.consumption_kwh);

  const apartmentMap = new Map(
    apartments.map((apartment) => [apartment.flat_number, apartment])
  );
  const selectedApartment = apartmentMap.get(selectedFlat);
  const focusItems = selectedFlat
    ? items.filter((item) => item.flat_number === selectedFlat)
    : items;
  const focusTotal = sumItems(focusItems, (item) => item.consumption_kwh);

  const highest = flatRows.slice(0, 5);
  const lowest = [...flatRows].slice(-5).reverse();
  const averagePerFlat = flatRows.length ? totalConsumption / flatRows.length : 0;

  const dailySeries = aggregateByPeriod(
    focusItems,
    (item) => item.consumption_kwh
  ).map((row) => ({ period: row.period, consumption: row.value }));

  const hourlyProfile = hourlyAverageProfile(
    focusItems,
    (item) => item.consumption_kwh
  );

  const profileRows = profileConsumption(flatRows, apartments);
  const topFlats = flatRows.slice(0, 10).map((row) => ({
    ...row,
    consumption_kwh: round(row.consumption_kwh, 1),
  }));

  const loading = consumption.loading;
  const error = consumption.error;
  const focusLabel = selectedFlat ? selectedFlat : "All apartments";

  function refreshAll() {
    consumption.reload();
    summary.reload();
  }

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="SolarTwin"
          icon={Building2}
          title="Apartment consumption"
          description="Flat-wise demand, household profiles and hourly consumption from stored meter readings."
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
        icon={Building2}
        title="Apartment consumption"
        description="Every flat-level total is aggregated from stored meter readings. Use the apartment selector to inspect one household."
        actions={
          <Badge variant="success" dot>
            {formatNumber(consumption.data?.loaded ?? 0)} meter readings
          </Badge>
        }
      />
      <SimulationTabs />

      <SimulationToolbar onRefresh={refreshAll} refreshing={loading} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total apartment consumption"
          value={formatEnergy(totalConsumption)}
          detail={`${formatNumber(flatRows.length)} apartments with readings`}
          icon={Home}
          tone="forest"
          loading={loading || summary.loading}
        />
        <StatCard
          label="Average per apartment"
          value={formatEnergy(averagePerFlat)}
          detail={`Across ${formatNumber(flatRows.length)} flats`}
          icon={Users}
          tone="emerald"
          loading={loading}
        />
        <StatCard
          label="Highest-consuming flat"
          value={highest[0]?.flat_number || "—"}
          detail={
            highest[0]
              ? `${formatEnergy(highest[0].consumption_kwh)} in range`
              : "No apartment readings"
          }
          icon={ArrowUpRight}
          tone="amber"
          loading={loading}
        />
        <StatCard
          label="Lowest-consuming flat"
          value={lowest[0]?.flat_number || "—"}
          detail={
            lowest[0]
              ? `${formatEnergy(lowest[0].consumption_kwh)} in range`
              : "No apartment readings"
          }
          icon={ArrowDownRight}
          tone="sky"
          loading={loading}
        />
      </div>

      <Card>
        <CardBody className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="min-w-[15rem] flex-1">
              <span className="field-label text-xs">Apartment focus</span>
              <select
                className="field h-9 text-xs"
                value={selectedFlat}
                onChange={(event) => setSelectedFlat(event.target.value)}
                disabled={apartmentsLoading}
              >
                <option value="">All apartments ({flatRows.length})</option>
                {apartments.map((apartment) => (
                  <option key={apartment.id} value={apartment.flat_number}>
                    {apartment.flat_number} · {apartment.apartment_category} ·{" "}
                    {PROFILE_LABELS[apartment.consumption_profile] ||
                      apartment.consumption_profile}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-x-6 gap-y-2 pb-1 text-[11px] text-slate-500">
              {selectedApartment ? (
                <>
                  <span>
                    Floor{" "}
                    <strong className="font-semibold text-slate-800">
                      {selectedApartment.floor_number}
                    </strong>
                  </span>
                  <span>
                    Residents{" "}
                    <strong className="font-semibold text-slate-800">
                      {selectedApartment.residents_count}
                    </strong>
                  </span>
                  <span>
                    Profile{" "}
                    <strong className="font-semibold text-slate-800">
                      {PROFILE_LABELS[selectedApartment.consumption_profile] ||
                        selectedApartment.consumption_profile}
                    </strong>
                  </span>
                  <span>
                    Consumption{" "}
                    <strong className="font-semibold text-slate-800">
                      {formatEnergy(focusTotal)}
                    </strong>
                  </span>
                </>
              ) : (
                <span>
                  Showing every apartment. Choose a flat to focus the trend charts and
                  hourly profile.
                </span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartPanel
          className="lg:col-span-2"
          title="Flat-wise consumption comparison"
          description="Top 10 apartments by total consumption in the selected range."
          icon={ListOrdered}
          loading={loading}
          error={error}
          onRetry={consumption.reload}
          empty={!topFlats.length}
          height="h-80"
        >
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topFlats}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatNumber(value, 0)}
                />
                <YAxis
                  type="category"
                  dataKey="flat_number"
                  tick={{ fontSize: 10, fill: "#334155" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(value) => `Apartment ${value}`}
                      valueFormatter={(value) => formatEnergy(value, 1)}
                    />
                  }
                />
                <Bar
                  dataKey="consumption_kwh"
                  name="Consumption"
                  fill="#3d8f60"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>

        <Card>
          <CardHeader
            title="Consumption extremes"
            description="Highest and lowest flats in range."
            icon={TrendingUp}
          />
          <CardBody className="space-y-4">
            <ExtremeList
              title="Highest"
              icon={ArrowUpRight}
              rows={highest}
              tone="text-rose-600"
            />
            <ExtremeList
              title="Lowest"
              icon={ArrowDownRight}
              rows={lowest}
              tone="text-emerald-600"
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title={`Daily consumption — ${focusLabel}`}
          description="Daily totals derived from stored meter readings for the selected range."
          icon={TrendingUp}
          loading={loading}
          error={error}
          onRetry={consumption.reload}
          empty={!dailySeries.length}
          height="h-72"
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="apartmentDaily" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3d8f60" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#3d8f60" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="consumption"
                  name="Consumption"
                  stroke="#2d744c"
                  strokeWidth={2}
                  fill="url(#apartmentDaily)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>

        <ChartPanel
          title={`Hourly profile — ${focusLabel}`}
          description="Average consumption for each hour of the day across the selected days (UTC)."
          icon={TrendingDown}
          loading={loading}
          error={error}
          onRetry={consumption.reload}
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
                  tickFormatter={(value) => formatNumber(value, 2)}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(value) => `${value} UTC`}
                      valueFormatter={(value) => formatEnergy(value, 3)}
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  name="Average consumption"
                  fill="#62ae80"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Household consumption profile"
            description="Usage grouped by the apartment's stored consumption profile."
            icon={PieChartIcon}
          />
          <CardBody>
            {loading ? (
              <p className="text-xs text-slate-500">Loading profile totals…</p>
            ) : !profileRows.length ? (
              <p className="text-xs text-slate-500">No profile data in this range.</p>
            ) : (
              <>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={profileRows}
                        dataKey="consumption_kwh"
                        nameKey="label"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="#ffffff"
                        strokeWidth={2}
                      >
                        {profileRows.map((row) => (
                          <Cell key={row.profile} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={
                          <ChartTooltip
                            labelFormatter={(_, payload) =>
                              payload?.[0]?.payload?.label
                            }
                            valueFormatter={(value) => formatEnergy(value, 1)}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-2">
                  {profileRows.map((row) => (
                    <div
                      key={row.profile}
                      className="flex items-center justify-between gap-3 text-[11px]"
                    >
                      <span className="inline-flex items-center gap-2 text-slate-600">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.label} · {formatNumber(row.apartments)} flats
                      </span>
                      <span className="font-medium text-slate-900">
                        {formatEnergy(row.consumption_kwh)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {apartmentSummary?.apartments_by_profile && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {Object.entries(apartmentSummary.apartments_by_profile).map(
                  ([profile, count]) => (
                    <Badge key={profile} variant="neutral">
                      {PROFILE_LABELS[profile] || profile}: {count}
                    </Badge>
                  )
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="All apartments"
            description={`Every flat in the selected range · ${formatNumber(consumption.data?.total ?? flatRows.length)} meter readings`}
            icon={Building2}
            action={
              consumption.data?.truncated ? (
                <Badge variant="warning" dot>
                  Partial load
                </Badge>
              ) : undefined
            }
          />
          <CardBody className="px-0 pb-0">
            <div className="max-h-[30rem] overflow-auto scrollbar-thin">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">#</th>
                    <th className="px-3 py-2.5 font-semibold">Flat</th>
                    <th className="px-3 py-2.5 font-semibold">Floor</th>
                    <th className="px-3 py-2.5 font-semibold">Residents</th>
                    <th className="px-3 py-2.5 font-semibold">Profile</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Consumption</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {flatRows.map((row, index) => {
                    const apartment = apartmentMap.get(row.flat_number);
                    return (
                      <tr
                        key={row.flat_number}
                        className={`border-t border-slate-100 ${
                          selectedFlat === row.flat_number ? "bg-forest-50/60" : ""
                        }`}
                      >
                        <td className="px-5 py-2 text-slate-400">{index + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {row.flat_number}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {apartment?.floor_number ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {apartment?.residents_count ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {PROFILE_LABELS[apartment?.consumption_profile] ||
                            apartment?.consumption_profile ||
                            "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">
                          {formatEnergy(row.consumption_kwh)}
                        </td>
                        <td className="px-5 py-2 text-right text-slate-500">
                          {totalConsumption
                            ? formatPercent((row.consumption_kwh / totalConsumption) * 100)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {!flatRows.length && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        No apartment readings in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ExtremeList({ title, icon: Icon, rows, tone }) {
  return (
    <div>
      <p className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${tone}`}>
        <Icon size={12} />
        {title}
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.length ? (
          rows.map((row, index) => (
            <div
              key={row.flat_number}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs"
            >
              <span className="inline-flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                  {index + 1}
                </span>
                <span className="font-medium text-slate-800">{row.flat_number}</span>
              </span>
              <span className="text-slate-500">{formatEnergy(row.consumption_kwh, 1)}</span>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-slate-500">No readings.</p>
        )}
      </div>
    </div>
  );
}
