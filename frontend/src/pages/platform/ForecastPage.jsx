import { useEffect, useMemo, useState } from "react";
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
import {
  BatteryCharging,
  CloudSun,
  Gauge,
  History,
  RefreshCw,
  Sparkles,
  Sun,
  Wind,
} from "lucide-react";
import ChartCard, { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import { SampleNotice, StatusBadge, labelForToken } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useNotifications } from "../../context/NotificationContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  estimateForecast,
  getForecastHistory,
  getForecastLocations,
} from "../../services/platformService";

const EMPTY_FORM = {
  location: "",
  solar_kwp: "",
  wind_kwp: "0",
  daily_consumption_kwh: "",
  backup_hours: "4",
};

export default function ForecastPage() {
  const { notify } = useNotifications();
  const locations = useApiData(getForecastLocations, []);
  const history = useApiData(getForecastHistory, []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (form.location) return;
    const first = locations.data?.items?.[0]?.location;
    if (first) setForm((current) => ({ ...current, location: first }));
  }, [locations.data, form.location]);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError("");
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await estimateForecast({
        location: form.location,
        solar_kwp: Number(form.solar_kwp),
        wind_kwp: Number(form.wind_kwp || 0),
        daily_consumption_kwh: Number(form.daily_consumption_kwh),
        backup_hours: Number(form.backup_hours || 0),
      });
      setResult(response);
      history.reload();
      notify({
        type: "success",
        title: "Estimate ready",
        message: `A ${response.forecast_type?.toLowerCase() || "estimated"} forecast and storage recommendation were generated.`,
        source: "Forecast & storage",
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to generate the estimate."));
    } finally {
      setSubmitting(false);
    }
  }

  const chartData = useMemo(
    () =>
      (result?.forecast || []).map((row) => ({
        ...row,
        label: formatDate(row.date).replace(/\s\d{4}$/, ""),
      })),
    [result]
  );

  const summary = result?.forecast_summary || {};
  const storage = result?.storage || {};
  const assumptions = result?.assumptions || {};
  const generation = result?.generation_estimates || {};
  const liveEnabled = locations.data?.live_weather?.enabled;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D8 · National intelligence"
        icon={CloudSun}
        title="Forecasting & storage planner"
        description="Estimate 7-day solar and wind generation from sample weather and size a battery for your daily consumption."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              locations.reload();
              history.reload();
            }}
            loading={locations.loading || history.loading}
          >
            <RefreshCw size={13} />
            Refresh
          </Button>
        }
      />

      <SampleNotice
        title={liveEnabled ? "Live weather inputs, estimated generation" : "Estimated output from sample weather"}
        tone="warning"
      >
        {liveEnabled
          ? "Weather inputs are requested live from Open-Meteo at forecast time. The generation conversion is still an engineering estimate — never metered output. If the provider is unreachable the response falls back to the bundled sample template and is labelled SAMPLE_TEMPLATE."
          : "Forecasts use a bundled sample weather template because live weather is disabled. Battery sizing uses documented planning assumptions and must be validated by an installer."}
      </SampleNotice>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader
            title="Planner inputs"
            description="All calculations run on the backend."
            icon={CloudSun}
          />
          <CardBody>
            {locations.error ? (
              <ErrorState
                compact
                title="Locations unavailable"
                message={locations.error}
                onRetry={locations.reload}
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                {error && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                    {error}
                  </p>
                )}
                <label className="block">
                  <span className="field-label">Forecast location</span>
                  <select
                    className="field"
                    value={form.location}
                    onChange={update("location")}
                    required
                    disabled={locations.loading}
                  >
                    <option value="">Select a location</option>
                    {(locations.data?.items || []).map((item) => (
                      <option key={item.location} value={item.location}>
                        {item.location} — {item.state}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Solar (kWp)</span>
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.solar_kwp}
                      onChange={update("solar_kwp")}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Wind (kWp)</span>
                    <input
                      className="field"
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.wind_kwp}
                      onChange={update("wind_kwp")}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="field-label">Daily consumption (kWh)</span>
                  <input
                    className="field"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={form.daily_consumption_kwh}
                    onChange={update("daily_consumption_kwh")}
                    required
                  />
                </label>
                <label className="block">
                  <span className="field-label">Desired backup (hours)</span>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={form.backup_hours}
                    onChange={update("backup_hours")}
                  />
                </label>
                <Button type="submit" size="sm" fullWidth loading={submitting}>
                  <Sparkles size={13} />
                  Generate estimate
                </Button>
                <p className="text-[11px] leading-5 text-slate-500">
                  Locations use sample 7-day weather templates. Enter at least one
                  of solar or wind capacity.
                </p>
              </form>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Average generation"
              value={`${formatNumber(summary.average_daily_generation_kwh, 1)} kWh`}
              detail="Per day across 7 days"
              icon={Sun}
              loading={submitting}
            />
            <StatCard
              label="Self-sufficiency"
              value={formatPercent(summary.self_sufficiency_pct, 2)}
              detail={`Consumption ${formatNumber(summary.daily_consumption_kwh, 1)} kWh/day`}
              icon={Gauge}
              tone="sky"
              loading={submitting}
            />
            <StatCard
              label="Recommended battery"
              value={`${formatNumber(storage.recommended_battery_kwh, 1)} kWh`}
              detail={`${formatNumber(storage.backup_hours, 1)} h backup`}
              icon={BatteryCharging}
              tone="emerald"
              loading={submitting}
            />
            <StatCard
              label="Indicative cost"
              value={formatCurrency(storage.estimated_cost)}
              detail="At ₹18,000/kWh planning rate"
              icon={BatteryCharging}
              tone="amber"
              loading={submitting}
            />
          </div>

          <ChartCard
            title="7-day generation estimate"
            description={
              result?.forecast_basis === "LIVE_WEATHER"
                ? "Solar and wind output derived from live Open-Meteo weather."
                : "Solar and wind output derived from the bundled sample weather template."
            }
            icon={Sun}
            loading={submitting}
            empty={!chartData.length}
            emptyTitle="Generate an estimate"
            emptyDescription="Enter your capacity and consumption to see the forecast."
            height="h-64"
            action={result ? <StatusBadge value={result.forecast_basis} /> : null}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} unit=" kWh" />
                <Tooltip content={<ChartTooltip unit=" kWh" />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="solar_generation_kwh" name="Solar" stackId="generation" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="wind_generation_kwh" name="Wind" stackId="generation" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {result && (
        <Card>
          <CardHeader
            title="Forecast basis, period and source"
            description={result.forecast_type_note}
            icon={CloudSun}
            action={<StatusBadge value={result.forecast_basis} />}
          />
          <CardBody>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                {[
                  ["Forecast type", result.forecast_type],
                  ["Basis", labelForToken(result.forecast_basis)],
                  [
                    "Period",
                    result.forecast_period
                      ? `${formatDate(result.forecast_period.start)} → ${formatDate(result.forecast_period.end)} (${result.forecast_period.days} days)`
                      : "—",
                  ],
                  ["Source", `${result.data_source?.name || "—"} (${result.data_source?.status || "—"})`],
                  [
                    "Retrieved",
                    result.data_source?.retrieved_at
                      ? formatDateTime(result.data_source.retrieved_at)
                      : "Not applicable — template inputs",
                  ],
                  ["7-day solar", `${formatNumber(generation.seven_day_solar_kwh, 1)} kWh`],
                  ["7-day wind", `${formatNumber(generation.seven_day_wind_kwh, 1)} kWh`],
                  ["7-day total", `${formatNumber(generation.seven_day_total_kwh, 1)} kWh`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <dt className="text-[11px] text-slate-500">{label}</dt>
                    <dd className="text-right text-xs font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-800">Methodology</h3>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600">
                  {Object.entries(result.methodology || {}).map(([key, value]) => (
                    <li key={key}>
                      <span className="font-medium text-slate-700">{labelForToken(key)}:</span>{" "}
                      {Array.isArray(value) ? value.join(" ") : value}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                  {result.data_source?.note}
                </p>
                {result.data_source?.request_url && (
                  <a
                    href={result.data_source.request_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[11px] font-medium text-forest-700 hover:underline"
                  >
                    Open the live weather request ↗
                  </a>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {result && (
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard
            title="Weather drivers"
            description={
              result.forecast_basis === "LIVE_WEATHER"
                ? "Daily irradiance and wind speed retrieved from Open-Meteo."
                : "Daily irradiance and wind speed from the bundled sample template."
            }
            icon={CloudSun}
            empty={!chartData.length}
            height="h-64"
            className="xl:col-span-2"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                <YAxis yAxisId="left" tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
                <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} unit=" m/s" />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line yAxisId="left" type="monotone" dataKey="irradiance_kwh_m2_day" name="Irradiance (kWh/m²/day)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="cloud_cover_pct" name="Cloud cover (%)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="wind_speed_ms" name="Wind (m/s)" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card>
            <CardHeader
              title="Storage recommendation"
              description={`${result.location} · ${result.state}`}
              icon={BatteryCharging}
              action={<Badge variant="warning">Estimated</Badge>}
            />
            <CardBody>
              <dl className="space-y-2">
                {[
                  ["Recommended battery", `${formatNumber(storage.recommended_battery_kwh, 1)} kWh`],
                  ["Usable energy", `${formatNumber(storage.usable_energy_kwh, 1)} kWh`],
                  ["Backup duration", `${formatNumber(storage.backup_hours, 1)} hours`],
                  ["Depth of discharge", formatPercent(storage.depth_of_discharge ? storage.depth_of_discharge * 100 : null, 0)],
                  ["Round-trip efficiency", formatPercent(storage.round_trip_efficiency ? storage.round_trip_efficiency * 100 : null, 0)],
                  ["Reserve held", `${formatNumber(storage.reserve_capacity_kwh, 1)} kWh`],
                  ["Solar stored", `${formatNumber(storage.stored_solar_energy_kwh, 1)} kWh`],
                  ["Evening grid without storage", `${formatNumber(storage.evening_grid_import_without_storage_kwh, 1)} kWh`],
                  ["Evening grid with storage", `${formatNumber(storage.evening_grid_import_with_storage_kwh, 1)} kWh`],
                  ["Evening grid reduction", formatPercent(storage.evening_grid_reduction_pct, 1)],
                  ["Indicative cost", formatCurrency(storage.estimated_cost)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <dt className="text-[11px] text-slate-500">{label}</dt>
                    <dd className="text-xs font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-slate-500">Daytime demand</p>
                  <p className="font-semibold text-slate-800">{formatNumber(summary.daytime_demand_kwh, 1)} kWh</p>
                </div>
                <div className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-slate-500">Night demand</p>
                  <p className="font-semibold text-slate-800">{formatNumber(summary.night_demand_kwh, 1)} kWh</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {result && (
        <Card>
          <CardHeader
            title="Assumptions & basis"
            description="Returned by the backend so the client performs no calculations."
            icon={Gauge}
          />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2">
              <dl className="space-y-2">
                {[
                  ["Solar performance ratio", formatNumber(assumptions.solar_performance_ratio, 2)],
                  ["Round-trip efficiency", formatPercent(assumptions.battery_round_trip_efficiency ? assumptions.battery_round_trip_efficiency * 100 : null, 0)],
                  ["Depth of discharge", formatPercent(assumptions.battery_depth_of_discharge ? assumptions.battery_depth_of_discharge * 100 : null, 0)],
                  ["Reserve fraction", formatPercent(assumptions.battery_reserve_fraction ? assumptions.battery_reserve_fraction * 100 : null, 0)],
                  ["Battery cost", `${formatCurrency(assumptions.battery_cost_per_kwh_inr)}/kWh`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <dt className="text-[11px] text-slate-500">{label}</dt>
                    <dd className="text-xs font-semibold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className="text-xs font-semibold text-slate-800">Wind power curve</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ["Cut-in", `${assumptions.wind_power_curve?.cut_in_ms ?? "—"} m/s`],
                    ["Rated", `${assumptions.wind_power_curve?.rated_ms ?? "—"} m/s`],
                    ["Cut-out", `${assumptions.wind_power_curve?.cut_out_ms ?? "—"} m/s`],
                    ["Max capacity factor", formatPercent(assumptions.wind_power_curve?.max_capacity_factor ? assumptions.wind_power_curve.max_capacity_factor * 100 : null, 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
                      <p className="text-slate-500">{label}</p>
                      <p className="font-semibold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                  {assumptions.disclaimer}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-slate-400">
              Generated {formatDateTime(result.created_at)} · method {assumptions.forecast_method}
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Recent storage estimates"
          description="Your latest planner runs."
          icon={History}
        />
        <CardBody>
          {history.error ? (
            <ErrorState compact title="History unavailable" message={history.error} onRetry={history.reload} />
          ) : history.loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-10 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : (history.data?.items || []).length ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">Location</th>
                    <th className="pb-2 text-right font-semibold">Solar</th>
                    <th className="pb-2 text-right font-semibold">Wind</th>
                    <th className="pb-2 text-right font-semibold">Consumption</th>
                    <th className="pb-2 text-right font-semibold">Battery</th>
                    <th className="pb-2 font-semibold">Basis</th>
                    <th className="pb-2 text-right font-semibold">Cost</th>
                    <th className="pb-2 text-right font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-2.5">
                        <p className="font-medium text-slate-700">{item.location}</p>
                        <p className="text-[10px] text-slate-400">{item.state}</p>
                      </td>
                      <td className="py-2.5 text-right text-slate-600">{formatNumber(item.solar_kwp, 1)} kWp</td>
                      <td className="py-2.5 text-right text-slate-600">{formatNumber(item.wind_kwp, 1)} kWp</td>
                      <td className="py-2.5 text-right text-slate-600">{formatNumber(item.daily_consumption_kwh, 1)} kWh</td>
                      <td className="py-2.5 text-right font-medium text-slate-800">{formatNumber(item.recommended_battery_kwh, 1)} kWh</td>
                      <td className="py-2.5">
                        {item.forecast_basis ? (
                          <StatusBadge value={item.forecast_basis} />
                        ) : (
                          <span className="text-[10px] text-slate-400">Unknown</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(item.estimated_cost)}</td>
                      <td className="py-2.5 text-right text-[10px] text-slate-400">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-center">
              <CloudSun size={26} className="mx-auto text-slate-300" />
              <p className="mt-2 text-xs font-medium text-slate-600">No estimates yet</p>
              <p className="mt-1 text-[11px] text-slate-500">Run the planner to save your first recommendation.</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
