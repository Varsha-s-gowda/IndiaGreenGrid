import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Lock,
  PlugZap,
  Sun,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import AllocationPageHeader from "../../components/allocation/AllocationPageHeader";
import AllocationToolbar from "../../components/allocation/AllocationToolbar";
import MethodBadge from "../../components/allocation/MethodBadge";
import NoAllocationState from "../../components/allocation/NoAllocationState";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import SegmentedControl from "../../components/simulation/SegmentedControl";
import { useAuth } from "../../context/AuthContext";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcHour,
  formatUtcHourOnly,
  formatUtcShortDate,
} from "../../lib/formatters";
import {
  getApartmentAllocation,
  getAllocationDaily,
  getAllocationHourly,
  getAllocationMonthly,
} from "../../services/allocationService";

const GRANULARITIES = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
];

export default function ApartmentDetailsPage() {
  const { isAdmin } = useAuth();
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
    apartments,
    apartmentsLoading,
    residentFlat,
  } = useAllocation();

  const requestedFlat = searchParams.get("flat");
  const flat = isAdmin ? requestedFlat || apartments[0]?.flat_number || "" : residentFlat;

  const granularity = GRANULARITIES.some(
    (item) => item.value === searchParams.get("view")
  )
    ? searchParams.get("view")
    : "daily";

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid && flat);

  useEffect(() => {
    if (!isAdmin || !apartments.length) return;
    if (!requestedFlat) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("flat", apartments[0].flat_number);
        return next;
      });
    }
  }, [apartments, isAdmin, requestedFlat, setSearchParams]);

  const detail = useApiData(
    () =>
      getApartmentAllocation(flat, {
        simulation_run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    [flat, runId, dateFrom, dateTo],
    { enabled: ready }
  );

  const savedRunId = detail.data?.allocation_run_id || null;
  const detailMethod = detail.data?.method || null;

  const records = useApiData(
    () => {
      const params = {
        flat_id: flat,
        date_from: dateFrom,
        date_to: dateTo,
        limit: 2000,
      };
      if (savedRunId) {
        params.allocation_run_id = savedRunId;
      } else {
        params.simulation_run_id = runId;
        params.method = detailMethod || "EQUAL_SHARE";
      }
      if (granularity === "hourly") return getAllocationHourly(params);
      if (granularity === "monthly") return getAllocationMonthly(params);
      return getAllocationDaily(params);
    },
    [flat, granularity, savedRunId, detailMethod, runId, dateFrom, dateTo],
    { enabled: Boolean(ready && detail.data) }
  );

  const chartData = useMemo(
    () =>
      (records.data?.items || []).map((item) => ({
        period: item.period,
        reading_time: item.reading_time,
        consumption: item.consumption_kwh,
        solar: item.allocated_solar_kwh,
        grid: item.grid_import_kwh,
        coverage: item.solar_coverage_percentage,
      })),
    [records.data]
  );

  function refreshAll() {
    refresh();
    detail.reload();
    records.reload();
  }

  function selectFlat(value) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("flat", value);
      return next;
    });
  }

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <AllocationPageHeader
          icon={Building2}
          title="Apartment details"
          description="Hourly, daily and monthly allocation records for one apartment."
        />
        <NoAllocationState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={Building2}
        title={isAdmin ? "Apartment allocation details" : "My apartment allocation"}
        description={
          isAdmin
            ? "Inspect one flat's hourly, daily and monthly allocation records. Only the selected apartment is queried."
            : "Your flat's allocation records. Resident access is restricted to the apartment linked to your account."
        }
        actions={
          <Badge variant={isAdmin ? "info" : "success"} dot>
            {isAdmin ? <Building2 size={11} /> : <Lock size={11} />}
            {isAdmin ? "Administrator view" : "Scoped to your flat"}
          </Badge>
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
          refreshing={detail.loading || records.loading}
        />
      )}

      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-3 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="field-label text-xs">Apartment</span>
              <select
                className="field h-9 w-44 text-xs"
                value={flat}
                onChange={(event) => selectFlat(event.target.value)}
                disabled={!isAdmin || apartmentsLoading}
              >
                {isAdmin ? (
                  apartments.length ? (
                    apartments.map((apartment) => (
                      <option key={apartment.flat_number} value={apartment.flat_number}>
                        {apartment.flat_number} · {apartment.apartment_category}
                      </option>
                    ))
                  ) : (
                    <option value="">No apartments</option>
                  )
                ) : (
                  <option value={flat || ""}>{flat || "No linked flat"}</option>
                )}
              </select>
            </label>
            <label>
              <span className="field-label text-xs">Granularity</span>
              <div className="pt-0.5">
                <SegmentedControl
                  label="Record granularity"
                  options={GRANULARITIES}
                  value={granularity}
                  onChange={(value) => {
                    if (value !== granularity) {
                      setSearchParams((current) => {
                        const next = new URLSearchParams(current);
                        next.set("view", value);
                        return next;
                      });
                    }
                  }}
                  size="md"
                />
              </div>
            </label>
          </div>
          <p className="max-w-xl text-[11px] leading-5 text-slate-500">
            {isAdmin
              ? "Changing the flat re-queries the backend. Residents cannot request another apartment."
              : "The backend rejects requests for any flat other than your linked apartment."}
          </p>
        </CardBody>
      </Card>

      {!flat && (
        <Card>
          <CardBody className="pt-5">
            <EmptyState
              icon={Building2}
              title="No apartment linked to this account"
              description="Ask an administrator to link your resident account to a flat before allocation details can be shown."
            />
          </CardBody>
        </Card>
      )}

      {flat && detail.loading && !detail.data && (
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

      {flat && detail.error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Apartment allocation unavailable"
              message={detail.error}
              onRetry={detail.reload}
            />
          </CardBody>
        </Card>
      )}

      {detail.data && (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  Apartment
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {detail.data.apartment.flat_number} ·{" "}
                  {detail.data.apartment.apartment_category}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Floor {detail.data.apartment.floor_number} ·{" "}
                  {detail.data.apartment.residents_count} residents ·{" "}
                  {detail.data.apartment.consumption_profile} profile
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MethodBadge method={detail.data.method} />
                <Badge variant={detail.data.saved ? "success" : "info"} dot>
                  {detail.data.saved
                    ? `Saved run #${detail.data.allocation_run_id}`
                    : "Preview only"}
                </Badge>
                {detail.data.is_hypothetical && (
                  <Badge variant="warning">Hypothetical</Badge>
                )}
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Solar allocated"
              value={formatEnergy(detail.data.summary.total_solar_allocation_kwh)}
              detail={`Ownership ${formatPercent(detail.data.summary.ownership_percentage, 3)}`}
              icon={Sun}
              tone="forest"
            />
            <StatCard
              label="Consumption"
              value={formatEnergy(detail.data.summary.total_consumption_kwh)}
              detail={`${formatPercent(detail.data.summary.solar_coverage_percentage)} covered by solar`}
              icon={Building2}
              tone="emerald"
            />
            <StatCard
              label="Grid import"
              value={formatEnergy(detail.data.summary.total_grid_import_kwh)}
              detail="Demand not served by solar"
              icon={PlugZap}
              tone="amber"
            />
            <StatCard
              label="Estimated solar credit"
              value={`₹${formatNumber(detail.data.summary.estimated_solar_credit, 2)}`}
              detail={`At ₹${formatNumber(detail.data.tariff_price_per_kwh, 2)}/kWh`}
              icon={CircleDollarSign}
              tone="sky"
            />
          </div>

          <Card>
            <CardHeader
              title={`${GRANULARITIES.find((item) => item.value === granularity)?.label || granularity} records`}
              description={`${formatNumber(records.data?.total || 0)} periods for ${formatUtcDate(detail.data.date_from)} – ${formatUtcDate(detail.data.date_to)}.`}
              icon={granularity === "hourly" ? Clock : CalendarDays}
              action={
                <Badge variant="forest">
                  {formatPercent(detail.data.summary.solar_coverage_percentage)} coverage
                </Badge>
              }
            />
            <CardBody>
              {records.loading ? (
                <Skeleton className="h-80 w-full" />
              ) : records.error ? (
                <ErrorState
                  compact
                  title="Records unavailable"
                  message={records.error}
                  onRetry={records.reload}
                />
              ) : !chartData.length ? (
                <EmptyState
                  compact
                  title="No records in this range"
                  description="Adjust the date range or choose another saved run."
                />
              ) : granularity === "hourly" ? (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="reading_time"
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        tickFormatter={formatUtcHourOnly}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={28}
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
                            labelFormatter={(value) => formatUtcHour(value)}
                            valueFormatter={(value) => formatEnergy(value, 3)}
                          />
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Line
                        type="monotone"
                        dataKey="consumption"
                        name="Consumption"
                        stroke="#94a3b8"
                        dot={false}
                        strokeWidth={1.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="solar"
                        name="Solar allocation"
                        stroke="#2d744c"
                        dot={false}
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="grid"
                        name="Grid import"
                        stroke="#d97706"
                        dot={false}
                        strokeWidth={1.25}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        tickFormatter={
                          granularity === "monthly"
                            ? (value) => value
                            : formatUtcShortDate
                        }
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        tickFormatter={(value) => formatNumber(value, 0)}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip
                            labelFormatter={(value) =>
                              granularity === "monthly"
                                ? value
                                : formatUtcDate(value)
                            }
                            valueFormatter={(value) => formatEnergy(value, 2)}
                          />
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar
                        dataKey="consumption"
                        name="Consumption"
                        fill="#94a3b8"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={26}
                      />
                      <Bar
                        dataKey="solar"
                        name="Solar allocation"
                        fill="#2d744c"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={26}
                      />
                      <Bar
                        dataKey="grid"
                        name="Grid import"
                        fill="#f59e0b"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={26}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Record ledger"
              description="The most recent 24 periods returned by the backend."
              icon={BarChart3}
            />
            <CardBody className="px-0 pb-0">
              {!chartData.length ? (
                <p className="px-5 pb-5 text-xs text-slate-500">
                  No records to list.
                </p>
              ) : (
                <div className="max-h-[28rem] overflow-auto scrollbar-thin">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                      <tr>
                        <th className="px-5 py-2.5 font-semibold">Period</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Consumption</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Solar</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Grid</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData
                        .slice(-24)
                        .reverse()
                        .map((row) => (
                          <tr key={row.period} className="border-t border-slate-100">
                            <td className="px-5 py-2 font-medium text-slate-700">
                              {granularity === "hourly"
                                ? formatUtcHour(row.reading_time)
                                : granularity === "monthly"
                                  ? row.period
                                  : formatUtcDate(row.period)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {formatNumber(row.consumption, 3)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {formatNumber(row.solar, 3)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              {formatNumber(row.grid, 3)}
                            </td>
                            <td className="px-5 py-2 text-right font-medium text-slate-800">
                              {formatPercent(row.coverage)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
              Source: {detail.data.saved ? "immutable saved allocation run" : "backend preview"} · algorithm{" "}
              {detail.data.algorithm_version} · {formatNumber(detail.data.hour_count)} complete hours.
            </p>
            <Badge variant="neutral">
              No billing record is created by this page
            </Badge>
          </div>
        </>
      )}
    </div>
  );
}
