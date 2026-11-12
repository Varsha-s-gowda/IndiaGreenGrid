import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import {
  Activity,
  Database,
  RefreshCw,
  TrendingUp,
  Zap,
} from "lucide-react";
import ChartCard, { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import { FreshnessStrip, SampleNotice, StatusBadge } from "../../components/platform/DataBadges";
import ExportButton from "../../components/platform/ExportButton";
import Modal from "../../components/platform/Modal";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import useApiData from "../../hooks/useApiData";
import {
  formatCapacity,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  getEnergyOverview,
  getEnergySourceHistory,
} from "../../services/platformService";

function SourceHistoryModal({ source, onClose }) {
  const { data, loading, error } = useApiData(
    () => (source ? getEnergySourceHistory(source.source_code) : Promise.resolve(null)),
    [source?.source_code],
    { enabled: Boolean(source) }
  );

  return (
    <Modal
      open={Boolean(source)}
      onClose={onClose}
      title={source ? `${source.source_name} history` : "Source history"}
      description="Installed capacity and gross generation from the bundled sample series."
      wide
    >
      {loading ? (
        <div className="h-72 animate-pulse rounded-lg bg-slate-100" />
      ) : error ? (
        <ErrorState compact title="History unavailable" message={error} />
      ) : data?.items?.length ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.items} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
              <YAxis yAxisId="left" tick={AXIS_TICK} axisLine={false} tickLine={false} width={54} />
              <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line yAxisId="left" type="monotone" dataKey="installed_capacity_mw" name="Capacity (MW)" stroke="#2d744c" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="generation_gwh" name="Generation (GWh)" stroke="#d97706" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No history is stored for this source.</p>
      )}
    </Modal>
  );
}

export default function EnergyPage() {
  const [year, setYear] = useState(null);
  const [source, setSource] = useState(null);
  const { data, loading, error, reload } = useApiData(
    () => getEnergyOverview(year ? { year } : {}),
    [year]
  );

  const mix = useMemo(
    () =>
      (data?.sources || []).map((row) => ({
        name: row.source_name,
        value: row.installed_capacity_mw,
        color: row.color,
      })),
    [data]
  );

  const exportRows = useMemo(
    () =>
      (data?.sources || []).map((row) => ({
        year: data?.selected_year,
        source: row.source_name,
        category: row.category,
        installed_capacity_mw: row.installed_capacity_mw,
        generation_gwh: row.generation_gwh,
        capacity_share_pct: row.capacity_share_pct,
        generation_share_pct: row.generation_share_pct,
        is_estimated: row.is_estimated,
      })),
    [data]
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="D1 · National intelligence" icon={Zap} title="Renewable energy dashboard" />
        <ErrorState title="Energy data unavailable" message={error} onRetry={reload} />
      </div>
    );
  }

  const totals = data?.totals || {};

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D1 · National intelligence"
        icon={Zap}
        title="National renewable energy dashboard"
        description="Installed capacity, generation and renewable share by energy source, with explicit provenance."
        actions={
          <>
            <select
              value={year || data?.selected_year || ""}
              onChange={(event) => setYear(Number(event.target.value))}
              className="field h-9 w-auto min-w-[110px] py-0 text-xs"
              aria-label="Select data year"
            >
              {(data?.available_years || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <ExportButton rows={exportRows} filename={`india-energy-${data?.selected_year || "latest"}.csv`} />
            <Button variant="outline" size="sm" onClick={reload} loading={loading}>
              <RefreshCw size={13} />
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Installed capacity"
          value={`${formatNumber(totals.installed_capacity_mw, 0)} MW`}
          detail={`${data?.selected_year || "—"} · all sources`}
          icon={Zap}
          loading={loading}
        />
        <StatCard
          label="Renewable capacity"
          value={`${formatNumber(totals.renewable_capacity_mw, 0)} MW`}
          detail={`${formatPercent(totals.renewable_capacity_share_pct, 2)} of capacity`}
          icon={TrendingUp}
          tone="emerald"
          loading={loading}
        />
        <StatCard
          label="Renewable generation"
          value={`${formatNumber(totals.renewable_generation_gwh, 0)} GWh`}
          detail={`${formatPercent(totals.renewable_generation_share_pct, 2)} of generation`}
          icon={Activity}
          tone="amber"
          loading={loading}
        />
        <StatCard
          label="Capacity growth"
          value={totals.capacity_growth_pct === null || totals.capacity_growth_pct === undefined
            ? "—"
            : `${totals.capacity_growth_pct > 0 ? "+" : ""}${formatPercent(totals.capacity_growth_pct, 2)}`}
          detail={
            data?.comparison?.previous_year
              ? `versus ${data.comparison.previous_year}`
              : "No prior year in dataset"
          }
          icon={TrendingUp}
          tone="sky"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          title="Capacity mix"
          description={`Share of installed capacity in ${data?.selected_year || "the selected year"}.`}
          icon={Zap}
          loading={loading}
          empty={!mix.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={mix} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%" paddingAngle={1} stroke="#fff" strokeWidth={1.5}>
                {mix.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip unit=" MW" />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, lineHeight: "16px" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Capacity by year"
          description="Renewable and conventional installed capacity."
          icon={TrendingUp}
          loading={loading}
          empty={!data?.capacity_series?.length}
          className="xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.capacity_series || []} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={58} />
              <Tooltip content={<ChartTooltip unit=" MW" />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="renewable_mw" name="Renewable" stackId="capacity" fill="#2d744c" radius={[0, 0, 0, 0]} />
              <Bar dataKey="conventional_mw" name="Conventional" stackId="capacity" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Generation trajectory"
        description="Gross generation by renewable and conventional sources."
        icon={Activity}
        loading={loading}
        empty={!data?.generation_series?.length}
        height="h-80"
        footer="Sample series curated from public CEA/Grid-India aggregates. Values are rounded and not a live official feed."
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data?.generation_series || []} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="genRenewable" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0d9488" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#0d9488" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<ChartTooltip unit=" GWh" />} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area type="monotone" dataKey="renewable_gwh" name="Renewable generation" stroke="#0d9488" strokeWidth={2} fill="url(#genRenewable)" />
            <Area type="monotone" dataKey="conventional_gwh" name="Conventional generation" stroke="#94a3b8" strokeWidth={2} fill="#94a3b8" fillOpacity={0.06} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <Card>
        <CardHeader
          title="Source breakdown"
          description="Select a row to inspect its stored capacity and generation history."
          icon={Database}
          action={<Badge variant="info">Click a source</Badge>}
        />
        <CardBody>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                  <th className="pb-2 font-semibold">Source</th>
                  <th className="pb-2 font-semibold">Category</th>
                  <th className="pb-2 text-right font-semibold">Capacity (MW)</th>
                  <th className="pb-2 text-right font-semibold">Generation (GWh)</th>
                  <th className="pb-2 text-right font-semibold">Capacity share</th>
                  <th className="pb-2 text-right font-semibold">Generation share</th>
                </tr>
              </thead>
              <tbody>
                {(data?.sources || []).map((row) => (
                  <tr
                    key={row.source_code}
                    onClick={() => setSource(row)}
                    className="cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-forest-50/40"
                  >
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                        {row.source_name}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <Badge variant={row.is_renewable ? "success" : "neutral"}>
                        {row.category}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right text-slate-600">{formatNumber(row.installed_capacity_mw, 0)}</td>
                    <td className="py-2.5 text-right text-slate-600">{formatNumber(row.generation_gwh, 0)}</td>
                    <td className="py-2.5 text-right text-slate-600">{formatPercent(row.capacity_share_pct, 2)}</td>
                    <td className="py-2.5 text-right text-slate-600">{formatPercent(row.generation_share_pct, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Sources & freshness"
          description="Every record carries a source status and retrieval timestamp."
          icon={Database}
        />
        <CardBody className="space-y-3">
          <FreshnessStrip items={data?.data?.sources || []} />
          <SampleNotice title="Sample national statistics">
            {data?.data?.disclaimer ||
              "Values are curated from public aggregates and are not a live official feed."}
          </SampleNotice>
          <p className="text-[11px] text-slate-500">
            Last retrieved: {data?.data?.last_updated ? new Date(data.data.last_updated).toLocaleString("en-IN") : "Not recorded"}
          </p>
        </CardBody>
      </Card>

      <SourceHistoryModal source={source} onClose={() => setSource(null)} />
    </div>
  );
}
