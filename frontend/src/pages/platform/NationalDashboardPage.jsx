import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CloudSun,
  Database,
  Gauge,
  Landmark,
  Leaf,
  Recycle,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import ChartCard, { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import { FreshnessStrip, SampleNotice, StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import {
  formatDateTime,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import { getDashboardOverview } from "../../services/platformService";

const ROLE_FOCUS_ICONS = {
  solar_calculations: Calculator,
  state_renewable: Zap,
  circular_logged: Recycle,
  recycling: Recycle,
  rpo_compliance: Target,
  rpo_shortfall: Target,
  renewable_share: Leaf,
  renewable_capacity: Zap,
  finance_catalogue: Landmark,
  solar_pipeline: Calculator,
  co2_avoided: Leaf,
  jobs: BriefcaseBusiness,
  recyclers: Recycle,
};

function focusValue(item) {
  if (item.value === null || item.value === undefined) return "Not recorded";
  if (item.unit === "%") return formatPercent(item.value, 2);
  return `${formatNumber(item.value, item.unit === "MW" || item.unit === "MWh" ? 1 : 0)} ${item.unit || ""}`.trim();
}

function sourceCapacityMix(energy) {
  return (energy?.sources || []).map((source) => ({
    name: source.source_name,
    value: source.installed_capacity_mw,
    color: source.color,
  }));
}

export default function NationalDashboardPage() {
  const { user, isAdmin } = useAuth();
  const { data, loading, error, reload } = useApiData(
    getDashboardOverview,
    []
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Overview"
          icon={Gauge}
          title="National dashboard"
          description="Role-aware view of India's renewable energy transition."
        />
        <ErrorState
          title="Dashboard unavailable"
          message={error}
          onRetry={reload}
        />
      </div>
    );
  }

  const energy = data?.energy;
  const totals = energy?.totals || {};
  const mix = sourceCapacityMix(energy);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        icon={Gauge}
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description={
          data?.user?.role_label
            ? `A ${data.user.role_label.toLowerCase()} view of national renewable energy, compliance, opportunities and community solar.`
            : "Role-aware view of India's renewable energy transition."
        }
        actions={
          <>
            <Badge variant="info">Sample public datasets</Badge>
            {isAdmin && (
              <Link to="/admin">
                <Button variant="outline" size="sm">
                  <Database size={13} />
                  Admin portal
                </Button>
              </Link>
            )}
          </>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-card"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-forest-900/10 bg-gradient-to-br from-forest-950 via-forest-900 to-forest-800 p-6 text-white shadow-card sm:p-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 85% 20%, rgba(52,211,153,0.45), transparent 45%), radial-gradient(circle at 10% 90%, rgba(16,185,129,0.35), transparent 50%)",
              }}
              aria-hidden="true"
            />
            <div className="relative flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  India · {data?.hero?.selected_year || "latest year"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {data?.hero?.title}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100/80">
                  {data?.hero?.notice}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to="/energy">
                    <Button variant="secondary" size="sm">
                      <Zap size={13} />
                      Energy dashboard
                    </Button>
                  </Link>
                  <Link to="/solar-calculator">
                    <Button
                      size="sm"
                      className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
                    >
                      <Calculator size={13} />
                      Rooftop calculator
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/90">
                    Renewable capacity
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatNumber(data?.hero?.renewable_capacity_mw, 0)}
                    <span className="ml-1 text-xs font-normal text-emerald-200/80">MW</span>
                  </p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/90">
                    Capacity share
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatPercent(data?.hero?.renewable_capacity_share_pct, 1)}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/90">
                    Renewable generation
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatNumber(data?.hero?.renewable_generation_gwh, 0)}
                    <span className="ml-1 text-xs font-normal text-emerald-200/80">GWh</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {(data?.role_focus || []).map((item) => {
              const Icon = ROLE_FOCUS_ICONS[item.key] || Gauge;
              return (
                <StatCard
                  key={item.key}
                  label={item.label}
                  value={focusValue(item)}
                  detail={item.detail}
                  icon={Icon}
                  tone={
                    item.key.includes("compliance")
                      ? "emerald"
                      : item.key.includes("shortfall")
                        ? "amber"
                        : item.key.includes("co2")
                          ? "sky"
                          : "forest"
                  }
                />
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="Capacity mix"
              description={`Installed capacity by source in ${energy?.selected_year || "the latest year"}.`}
              icon={Zap}
              empty={!mix.length}
              className="xl:col-span-1"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="52%"
                    outerRadius="82%"
                    paddingAngle={1}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  >
                    {mix.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<ChartTooltip unit=" MW" />}
                    formatter={(value) => formatNumber(value, 0)}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: 10, lineHeight: "16px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Renewable capacity trajectory"
              description="Renewable versus conventional installed capacity from the bundled sample series."
              icon={TrendingUp}
              empty={!energy?.capacity_series?.length}
              className="xl:col-span-2"
              footer="Sample values curated from public CEA/MNRE aggregates. Not a live official feed."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={energy?.capacity_series || []}
                  margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="reCapacity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3d8f60" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#3d8f60" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={58} tickFormatter={(value) => formatNumber(value, 0)} />
                  <Tooltip content={<ChartTooltip unit=" MW" />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="renewable_mw" name="Renewable" stroke="#2d744c" strokeWidth={2} fill="url(#reCapacity)" />
                  <Area type="monotone" dataKey="conventional_mw" name="Conventional" stroke="#94a3b8" strokeWidth={2} fillOpacity={0.06} fill="#94a3b8" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader
                title="Data provenance"
                description="Configured sources, labelled honestly."
                icon={Database}
                action={
                  <Badge variant={data?.data_summary?.unavailable ? "warning" : "success"}>
                    {data?.data_summary?.fresh ?? 0} fresh · {data?.data_summary?.unavailable ?? 0} unavailable
                  </Badge>
                }
              />
              <CardBody>
                <FreshnessStrip items={data?.data_freshness || []} compact />
                <p className="mt-3 text-[11px] leading-5 text-slate-500">
                  Sources marked sample are bundled public-data extracts. Unavailable
                  integrations are never filled with fabricated values.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Opportunity snapshot"
                description="Jobs, finance and recycling content available to you."
                icon={BriefcaseBusiness}
                action={
                  <Link
                    to="/jobs"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Explore <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody className="space-y-2">
                {[
                  {
                    label: "Green job listings",
                    value: data?.opportunities?.jobs_count,
                    to: "/jobs",
                    icon: BriefcaseBusiness,
                  },
                  {
                    label: "Finance products",
                    value: data?.opportunities?.finance_schemes_count,
                    to: "/finance",
                    icon: Landmark,
                  },
                  {
                    label: "Recyclers",
                    value: data?.opportunities?.recyclers_count,
                    to: "/circular",
                    icon: Recycle,
                  },
                  {
                    label: "Your applications",
                    value: data?.opportunities?.applications_count,
                    to: "/jobs",
                    icon: Target,
                  },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <Link
                      key={row.label}
                      to={row.to}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700 transition hover:border-forest-200 hover:bg-forest-50/40"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon size={14} className="text-forest-700" />
                        {row.label}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {formatNumber(row.value, 0)}
                      </span>
                    </Link>
                  );
                })}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Community solar"
                description="The retained 60-flat society module."
                icon={Building2}
                action={<Badge variant="forest">Sample society</Badge>}
              />
              <CardBody className="space-y-2">
                {[
                  ["Apartments", data?.community_solar?.apartments],
                  ["Simulation runs", data?.community_solar?.simulation_runs],
                  ["Allocation runs", data?.community_solar?.allocation_runs],
                  ["Bills issued", data?.community_solar?.bills],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-slate-100 py-2 last:border-b-0"
                  >
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs font-semibold text-slate-800">
                      {formatNumber(value, 0)}
                    </span>
                  </div>
                ))}
                <Link to="/community">
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    <Building2 size={13} />
                    Open community hub
                  </Button>
                </Link>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Regional leaders"
                description="Top states by renewable capacity in the latest sample year."
                icon={Leaf}
              />
              <CardBody>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                        <th className="pb-2 font-semibold">State</th>
                        <th className="pb-2 text-right font-semibold">Renewable MW</th>
                        <th className="pb-2 text-right font-semibold">Solar MW</th>
                        <th className="pb-2 text-right font-semibold">Wind MW</th>
                        <th className="pb-2 text-right font-semibold">CO2 avoided (t)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.regional || []).map((row) => (
                        <tr key={row.state} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-2.5 font-medium text-slate-800">{row.state}</td>
                          <td className="py-2.5 text-right text-slate-600">{formatNumber(row.total_renewable_mw, 0)}</td>
                          <td className="py-2.5 text-right text-slate-600">{formatNumber(row.solar_capacity_mw, 0)}</td>
                          <td className="py-2.5 text-right text-slate-600">{formatNumber(row.wind_capacity_mw, 0)}</td>
                          <td className="py-2.5 text-right text-slate-600">{formatNumber(row.co2_avoided_tonnes, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">
                  Regional capacity and impact values are sample planning data, not a live feed.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Impact snapshot"
                description="Estimated avoided emissions from renewable generation."
                icon={Leaf}
                action={<Badge variant="info">Estimated</Badge>}
              />
              <CardBody className="space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    CO2 avoided
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatNumber(data?.impact?.summary?.co2_avoided_million_tonnes, 3)}
                    <span className="ml-1 text-xs font-normal text-slate-500">Mt</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-[10px] text-slate-500">Trees equivalent</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {formatNumber(data?.impact?.summary?.trees_equivalent, 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-[10px] text-slate-500">Cars off road</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {formatNumber(data?.impact?.summary?.cars_off_road_equivalent, 0)}
                    </p>
                  </div>
                </div>
                <Link to="/impact">
                  <Button variant="secondary" size="sm" className="w-full">
                    <Leaf size={13} />
                    Environmental impact
                  </Button>
                </Link>
              </CardBody>
            </Card>
          </div>

          {data?.rpo && (
            <Card>
              <CardHeader
                title="RPO compliance pulse"
                description="Renewable purchase obligations in your scope."
                icon={Target}
                action={
                  <Link
                    to="/rpo"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Open tracker <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ["Overall compliance", formatPercent(data.rpo.summary.overall_compliance_pct, 2)],
                    ["Targets", formatNumber(data.rpo.summary.target_count, 0)],
                    ["Compliant", formatNumber(data.rpo.summary.compliant_count, 0)],
                    ["Shortfall", `${formatNumber(data.rpo.summary.total_shortfall_mwh, 0)} MWh`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries({
                    COMPLIANT: data.rpo.summary.compliant_count,
                    "AT_RISK": data.rpo.summary.at_risk_count,
                    NON_COMPLIANT: data.rpo.summary.non_compliant_count,
                    NOT_RECORDED: data.rpo.summary.not_recorded_count,
                  }).map(([status, count]) => (
                    <span key={status} className="inline-flex items-center gap-1.5">
                      <StatusBadge value={status} />
                      <span className="text-[11px] text-slate-500">{count}</span>
                    </span>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {isAdmin && (
            <Card>
              <CardHeader
                title="Recent platform activity"
                description="Audit-log entries written by real user actions."
                icon={CloudSun}
              />
              <CardBody>
                <ul className="space-y-2">
                  {(data?.activity || []).slice(0, 6).map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">
                          {item.description}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {item.user_email} · {item.module}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatDateTime(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
                {!(data?.activity || []).length && (
                  <p className="text-xs text-slate-500">No audit activity yet.</p>
                )}
              </CardBody>
            </Card>
          )}

          <SampleNotice title="Data honesty">
            {data?.hero?.notice} Forecasts are always labelled ESTIMATED. Unavailable
            integrations are shown as unavailable and are never backfilled with
            invented values.
          </SampleNotice>
        </>
      )}
    </div>
  );
}
