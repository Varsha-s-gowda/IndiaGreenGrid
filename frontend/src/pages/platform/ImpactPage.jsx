import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CarFront,
  Factory,
  Leaf,
  RefreshCw,
  Search,
  TreePine,
  Wind,
} from "lucide-react";
import ChartCard, { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import { SampleNotice } from "../../components/platform/DataBadges";
import ExportButton from "../../components/platform/ExportButton";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import useApiData from "../../hooks/useApiData";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import { getImpactOverview } from "../../services/platformService";

const AQI_TONES = {
  Good: "success",
  Satisfactory: "success",
  Moderate: "warning",
  Poor: "danger",
  "Very Poor": "danger",
  Severe: "danger",
};

export default function ImpactPage() {
  const { data, loading, error, reload } = useApiData(getImpactOverview, []);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("co2_avoided_tonnes");

  const summary = data?.summary || {};
  const regional = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...(data?.regional || [])]
      .filter((row) => !term || row.state.toLowerCase().includes(term))
      .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  }, [data, search, sortKey]);

  const exportRows = useMemo(
    () =>
      (data?.regional || []).map((row) => ({
        state: row.state,
        year: row.year,
        solar_capacity_mw: row.solar_capacity_mw,
        wind_capacity_mw: row.wind_capacity_mw,
        total_renewable_mw: row.total_renewable_mw,
        co2_avoided_tonnes: row.co2_avoided_tonnes,
        air_quality_index: row.air_quality_index,
        pm25: row.pm25,
      })),
    [data]
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="D7 · National intelligence" icon={Leaf} title="Environmental impact" />
        <ErrorState title="Impact data unavailable" message={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D7 · National intelligence"
        icon={Leaf}
        title="Environmental impact dashboard"
        description="Estimated avoided emissions, renewable capacity by state and indicative air-quality readings."
        actions={
          <>
            <ExportButton rows={exportRows} filename="environmental-impact.csv" />
            <Button variant="outline" size="sm" onClick={reload} loading={loading}>
              <RefreshCw size={13} />
              Refresh
            </Button>
          </>
        }
      />

      <SampleNotice title="Estimates, not audited reductions">
        {data?.disclaimer ||
          "Avoided emissions are estimated from renewable generation using a planning emission factor."}
      </SampleNotice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CO₂ avoided"
          value={`${formatNumber(summary.co2_avoided_million_tonnes, 3)} Mt`}
          detail={
            summary.growth_pct === null || summary.growth_pct === undefined
              ? "Latest recorded year"
              : `${summary.growth_pct >= 0 ? "+" : ""}${formatPercent(summary.growth_pct, 2)} year on year`
          }
          icon={Factory}
          loading={loading}
        />
        <StatCard
          label="Renewable generation"
          value={`${formatNumber(summary.renewable_generation_gwh, 0)} GWh`}
          detail={`${formatPercent(summary.renewable_share_pct, 2)} of generation`}
          icon={Wind}
          tone="sky"
          loading={loading}
        />
        <StatCard
          label="Trees equivalent"
          value={formatNumber(summary.trees_equivalent, 0)}
          detail="Planning conversion, not measured"
          icon={TreePine}
          tone="emerald"
          loading={loading}
        />
        <StatCard
          label="Cars off the road"
          value={formatNumber(summary.cars_off_road_equivalent, 0)}
          detail={`${formatNumber(summary.air_quality_cities, 0)} cities reporting AQI`}
          icon={CarFront}
          tone="amber"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          title="Avoided emissions trend"
          description="Estimated CO₂ avoided by year."
          icon={Leaf}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!data?.historical?.length}
          height="h-72"
          className="xl:col-span-2"
          footer="Avoided emissions use a planning emission factor supplied by the backend."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.historical || []} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <defs>
                <linearGradient id="impact-co2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2d744c" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2d744c" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} tickFormatter={(value) => formatNumber(value / 1_000_000, 1)} unit="M" />
              <Tooltip content={<ChartTooltip unit=" t" />} />
              <Area type="monotone" dataKey="co2_avoided_tonnes" name="CO₂ avoided (t)" stroke="#2d744c" strokeWidth={2} fill="url(#impact-co2)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader
            title="Conversion factors"
            description="Returned by the backend, never hardcoded in the client."
            icon={Factory}
          />
          <CardBody>
            <dl className="space-y-2">
              {[
                ["CO₂ factor", `${formatNumber(data?.conversion_factors?.co2_factor_tonnes_per_mwh, 2)} t/MWh`],
                ["Trees per tonne CO₂", formatNumber(data?.conversion_factors?.trees_per_tonne_co2, 4)],
                ["Cars per tonne CO₂", formatNumber(data?.conversion_factors?.cars_off_road_per_tonne_co2, 4)],
                ["Regions tracked", formatNumber(summary.regions_tracked, 0)],
                ["Renewable capacity share", formatPercent(summary.renewable_capacity_share_pct, 2)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <dt className="text-[11px] text-slate-500">{label}</dt>
                  <dd className="text-xs font-semibold text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              These factors translate generation into communication equivalents.
              They do not represent verified carbon credits.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Top states by avoided emissions"
          description="Latest available state-year records."
          icon={Wind}
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!data?.regional?.length}
          height="h-72"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(data?.regional || []).slice(0, 10)} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(value) => formatNumber(value / 1000, 0)} unit="k" />
              <YAxis type="category" dataKey="state" tick={{ ...AXIS_TICK, fontSize: 9 }} width={92} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip unit=" t" />} />
              <Bar dataKey="co2_avoided_tonnes" name="CO₂ avoided" fill="#2d744c" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader
            title="Air quality (sample)"
            description={
              data?.air_quality_source?.disclaimer ||
              "Illustrative sample readings, not a live CPCB feed."
            }
            icon={Wind}
            action={
              <Badge variant="info">
                {data?.air_quality_source?.status === "unavailable" ? "Unavailable" : "Sample"}
              </Badge>
            }
          />
          <CardBody>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="h-9 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : (data?.air_quality || []).length ? (
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">City</th>
                      <th className="pb-2 text-right font-semibold">AQI</th>
                      <th className="pb-2 text-right font-semibold">PM2.5</th>
                      <th className="pb-2 font-semibold">Category</th>
                      <th className="pb-2 text-right font-semibold">Measured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.air_quality.slice(0, 12).map((row) => (
                      <tr key={`${row.city}-${row.measured_at}`} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2">
                          <p className="font-medium text-slate-700">{row.city}</p>
                          <p className="text-[10px] text-slate-400">{row.state}</p>
                        </td>
                        <td className="py-2 text-right font-semibold text-slate-800">{formatNumber(row.aqi, 0)}</td>
                        <td className="py-2 text-right text-slate-600">{formatNumber(row.pm25, 1)}</td>
                        <td className="py-2"><Badge variant={AQI_TONES[row.category] || "neutral"}>{row.category}</Badge></td>
                        <td className="py-2 text-right text-[10px] text-slate-400">
                          {row.measured_at ? formatDate(row.measured_at) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-slate-500">
                No air-quality readings are available.
              </p>
            )}
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Source: {data?.air_quality_source?.name || "CPCB"} · status{" "}
              {data?.air_quality_source?.status || "sample"}
              {data?.air_quality_source?.last_success_at
                ? ` · last updated ${formatDateTime(data.air_quality_source.last_success_at)}`
                : ""}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Methodology and data classification"
          description="Every calculated figure is labelled as measured, estimated or sample by the backend."
          icon={Factory}
          action={<Badge variant="warning">Estimated</Badge>}
        />
        <CardBody>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {data?.methodology?.co2_avoided && (
                <div className="rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">Avoided emissions</p>
                    <Badge variant="info">{data.methodology.co2_avoided.classification}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-600">
                    Formula: <code className="rounded bg-slate-100 px-1">{data.methodology.co2_avoided.formula}</code>
                  </p>
                  <p className="mt-0.5 text-[10px] leading-5 text-slate-500">
                    Factor {data.methodology.co2_avoided.emission_factor_tonnes_per_mwh} t/MWh — {data.methodology.co2_avoided.factor_source}
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] leading-4 text-slate-500">
                    {(data.methodology.co2_avoided.limitations || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data?.methodology?.air_quality && (
                <div className="rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">Air quality</p>
                    <Badge variant="info">{data.methodology.air_quality.classification}</Badge>
                  </div>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] leading-4 text-slate-500">
                    {(data.methodology.air_quality.limitations || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Classification of each displayed series
              </p>
              {Object.entries(data?.data_classification || {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <span className="text-[11px] text-slate-600">{key.replaceAll("_", " ")}</span>
                  <Badge variant="neutral">{value}</Badge>
                </div>
              ))}
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                {data?.measured_observations?.description}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Regional impact detail"
          description="Sortable state-level renewable capacity and avoided emissions."
          icon={Leaf}
          action={<Badge variant="info">{regional.length} states</Badge>}
        />
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search a state…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search states"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value)}
              aria-label="Sort regional data"
            >
              <option value="co2_avoided_tonnes">Sort by CO₂ avoided</option>
              <option value="total_renewable_mw">Sort by renewable capacity</option>
              <option value="solar_capacity_mw">Sort by solar capacity</option>
              <option value="air_quality_index">Sort by AQI</option>
            </select>
          </div>
          {loading ? (
            <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
          ) : regional.length ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">State</th>
                    <th className="pb-2 text-right font-semibold">Solar (MW)</th>
                    <th className="pb-2 text-right font-semibold">Wind (MW)</th>
                    <th className="pb-2 text-right font-semibold">Total RE (MW)</th>
                    <th className="pb-2 text-right font-semibold">CO₂ avoided (t)</th>
                    <th className="pb-2 text-right font-semibold">AQI</th>
                  </tr>
                </thead>
                <tbody>
                  {regional.map((row) => (
                    <tr key={row.state} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-2.5 font-medium text-slate-700">{row.state}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatNumber(row.solar_capacity_mw, 0)}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatNumber(row.wind_capacity_mw, 0)}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatNumber(row.total_renewable_mw, 0)}</td>
                      <td className="py-2.5 text-right font-medium text-slate-800">{formatNumber(row.co2_avoided_tonnes, 0)}</td>
                      <td className="py-2.5 text-right text-slate-600">{row.air_quality_index ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-slate-500">No states match this search.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
