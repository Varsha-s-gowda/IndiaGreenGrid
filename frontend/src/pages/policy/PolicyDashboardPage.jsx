import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CloudSun,
  Gauge,
  Landmark,
  Leaf,
  Recycle,
  Scale,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  ComposedChart,
  CartesianGrid,
  Bar,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartCard, {
  AXIS_TICK,
  ChartTooltip,
  GRID_STROKE,
} from "../../components/platform/ChartKit";
import { StatusBadge } from "../../components/platform/DataBadges";
import ExportButton from "../../components/platform/ExportButton";
import {
  ActivityCard,
  NotificationsCard,
  QuickActionsCard,
  WelcomeBanner,
} from "../../components/dashboard/DashboardKit";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { canAccessPath } from "../../lib/workspaces";
import {
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import { getDashboardOverview } from "../../services/platformService";

function focusValue(item) {
  if (!item || item.value === null || item.value === undefined) return "Not recorded";
  if (item.unit === "%") return formatPercent(item.value, 2);
  return `${formatNumber(item.value, item.unit === "MW" ? 1 : 0)} ${
    item.unit || ""
  }`.trim();
}

export default function PolicyDashboardPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);

  if (overview.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Policy & regulation"
          icon={Scale}
          title="Policy dashboard"
          description="National renewable performance, compliance and community oversight."
        />
        <ErrorState
          title="Policy dashboard unavailable"
          message={overview.error}
          onRetry={overview.reload}
        />
      </div>
    );
  }

  const loading = overview.loading && !overview.data;
  const energy = overview.data?.energy;
  const totals = energy?.totals || {};
  const rpo = overview.data?.rpo;
  const impactSummary = overview.data?.impact?.summary || {};
  const impactHistory = overview.data?.impact?.historical || [];
  const regionalRows = overview.data?.regional || [];
  const community = overview.data?.community_solar || {};
  const opportunities = overview.data?.opportunities || {};
  const circularTotals = overview.data?.circular?.totals || {};
  const focus = Object.fromEntries(
    (overview.data?.role_focus || []).map((item) => [item.key, item])
  );

  const rpoRows = rpo?.yearly_tracker || [];
  const mix = (energy?.sources || []).map((source) => ({
    name: source.source_name,
    value: source.installed_capacity_mw,
    color: source.color,
  }));

  const quickActions = [
    {
      to: "/energy",
      label: "Energy analytics",
      detail: "National capacity, generation and renewable share",
      icon: Zap,
    },
    {
      to: "/rpo",
      label: "RPO tracking",
      detail: "Obligations, recorded compliance and shortfall",
      icon: Target,
    },
    {
      to: "/impact",
      label: "Environmental impact",
      detail: "Avoided emissions and regional comparison",
      icon: Leaf,
    },
    {
      to: "/forecast",
      label: "Forecast & storage",
      detail: "Renewable integration and storage planning",
      icon: CloudSun,
    },
    {
      to: "/community",
      label: "Community solar",
      detail: "Society generation, allocation and billing",
      icon: Building2,
    },
    {
      to: "/jobs",
      label: "Green jobs",
      detail: "Renewable employment listings and applications",
      icon: BriefcaseBusiness,
    },
    {
      to: "/finance",
      label: "Green finance",
      detail: "Published loans, subsidies and mechanisms",
      icon: Landmark,
    },
    {
      to: "/circular",
      label: "Circular economy",
      detail: "Panel, e-waste and battery recycling records",
      icon: Recycle,
    },
  ].filter((action) => canAccessPath(user, action.to));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Policy & regulation"
        icon={Scale}
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description={`National renewable performance, compliance and community-solar oversight for ${
          user?.organization || user?.state || "your jurisdiction"
        }.`}
        actions={
          <>
            <Badge variant="forest" dot>
              Policymaker workspace
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={overview.reload}
              loading={overview.loading}
            >
              Refresh
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Card key={key}>
              <CardBody className="space-y-2 pt-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-40" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <WelcomeBanner
            eyebrow="National oversight"
            title="Evidence for renewable policy decisions"
            description="Capacity, compliance and avoided emissions are drawn from the bundled national sample. Community-solar and programme counts show how the platform is being used without exposing resident records."
            user={user}
            badges={["Policy scoped", "Sample public datasets"]}
            stats={[
              {
                label: "Renewable share",
                value: focusValue(focus.renewable_share),
              },
              {
                label: "RPO compliance",
                value: focusValue(focus.rpo_compliance),
              },
              {
                label: "CO₂ avoided (estimated)",
                value: focusValue(focus.co2_avoided),
                wide: true,
              },
            ]}
            actions={
              <>
                <Link to="/rpo">
                  <Button variant="secondary" size="sm">
                    <Target size={13} />
                    RPO tracker
                  </Button>
                </Link>
                <Link to="/energy">
                  <Button
                    size="sm"
                    className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Zap size={13} />
                    Energy analytics
                  </Button>
                </Link>
              </>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Renewable capacity"
              value={`${formatNumber(totals.renewable_capacity_mw, 0)} MW`}
              detail={`Selected year ${energy?.selected_year || "—"}`}
              icon={Zap}
              tone="forest"
            />
            <StatCard
              label="Renewable share"
              value={formatPercent(totals.renewable_capacity_share_pct, 2)}
              detail="Share of national installed capacity"
              icon={TrendingUp}
              tone="emerald"
            />
            <StatCard
              label="RPO compliance"
              value={
                rpo?.summary?.overall_compliance_pct === null ||
                rpo?.summary?.overall_compliance_pct === undefined
                  ? "Not recorded"
                  : formatPercent(rpo.summary.overall_compliance_pct, 2)
              }
              detail={`${formatNumber(
                rpo?.summary?.target_count,
                0
              )} recorded obligations`}
              icon={Target}
              tone="sky"
            />
            <StatCard
              label="CO₂ avoided"
              value={`${formatNumber(
                impactSummary.co2_avoided_million_tonnes,
                3
              )} Mt`}
              detail={
                impactSummary.growth_pct === null ||
                impactSummary.growth_pct === undefined
                  ? "Latest recorded year"
                  : `${formatPercent(impactSummary.growth_pct, 2)} year on year`
              }
              icon={Leaf}
              tone="amber"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="Capacity trajectory"
              description="Renewable versus conventional installed capacity."
              icon={TrendingUp}
              empty={!energy?.capacity_series?.length}
              className="xl:col-span-2"
              footer="Bundled sample series based on public CEA/MNRE aggregates."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={energy?.capacity_series || []}
                  margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="policyCapacity"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#3d8f60" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#3d8f60" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke={GRID_STROKE}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="year"
                    tick={AXIS_TICK}
                    axisLine={{ stroke: GRID_STROKE }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(value) => formatNumber(value, 0)}
                  />
                  <Tooltip content={<ChartTooltip unit=" MW" />} />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="renewable_mw"
                    name="Renewable"
                    stroke="#2d744c"
                    strokeWidth={2}
                    fill="url(#policyCapacity)"
                  />
                  <Area
                    type="monotone"
                    dataKey="conventional_mw"
                    name="Conventional"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    fillOpacity={0.06}
                    fill="#94a3b8"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Capacity mix"
              description={`Installed capacity by source in ${
                energy?.selected_year || "the latest year"
              }.`}
              icon={Zap}
              empty={!mix.length}
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
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="RPO yearly tracker"
              description="Required renewable energy, recorded compliance and shortfall."
              icon={Target}
              empty={!rpoRows.length}
              className="xl:col-span-2"
              action={
                <ExportButton rows={rpoRows} filename="policy-rpo-tracker.csv" />
              }
              footer="Compliance is calculated by the backend. Years without records are shown as not recorded."
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={rpoRows}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke={GRID_STROKE}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="year"
                    tick={AXIS_TICK}
                    axisLine={{ stroke: GRID_STROKE }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(value) => formatNumber(value, 0)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="required_mwh"
                    name="Required (MWh)"
                    fill="#cbd5e1"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={26}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="actual_mwh"
                    name="Recorded (MWh)"
                    fill="#2d744c"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={26}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="compliance_pct"
                    name="Compliance (%)"
                    stroke="#d97706"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={{ r: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card>
              <CardHeader
                title="Compliance scorecard"
                description="Status of every recorded obligation."
                icon={Gauge}
              />
              <CardBody className="space-y-2">
                {[
                  ["Overall compliance", formatPercent(rpo?.summary?.overall_compliance_pct, 2)],
                  ["Targets", formatNumber(rpo?.summary?.target_count, 0)],
                  ["Compliant", formatNumber(rpo?.summary?.compliant_count, 0)],
                  ["At risk", formatNumber(rpo?.summary?.at_risk_count, 0)],
                  [
                    "Non-compliant",
                    formatNumber(rpo?.summary?.non_compliant_count, 0),
                  ],
                  [
                    "Not recorded",
                    formatNumber(rpo?.summary?.not_recorded_count, 0),
                  ],
                  [
                    "Recorded shortfall",
                    `${formatNumber(rpo?.summary?.total_shortfall_mwh, 0)} MWh`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-slate-100 py-2 last:border-b-0"
                  >
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs font-semibold text-slate-800">
                      {value}
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.entries({
                    COMPLIANT: rpo?.summary?.compliant_count,
                    AT_RISK: rpo?.summary?.at_risk_count,
                    NON_COMPLIANT: rpo?.summary?.non_compliant_count,
                    NOT_RECORDED: rpo?.summary?.not_recorded_count,
                  }).map(([status, count]) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1"
                    >
                      <StatusBadge value={status} />
                      <span className="text-[10px] text-slate-500">{count}</span>
                    </span>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Regional renewable leaders"
                description="Top states by renewable capacity in the latest sample year."
                icon={Leaf}
                action={
                  <ExportButton
                    rows={regionalRows}
                    filename="policy-regional-renewables.csv"
                  />
                }
              />
              <CardBody>
                {regionalRows.length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                          <th className="pb-2 font-semibold">State</th>
                          <th className="pb-2 text-right font-semibold">Renewable MW</th>
                          <th className="pb-2 text-right font-semibold">Solar MW</th>
                          <th className="pb-2 text-right font-semibold">Wind MW</th>
                          <th className="pb-2 text-right font-semibold">CO₂ avoided (t)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regionalRows.map((row) => (
                          <tr
                            key={row.state}
                            className="border-b border-slate-100 last:border-b-0"
                          >
                            <td className="py-2.5 font-medium text-slate-800">
                              {row.state}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatNumber(row.total_renewable_mw, 0)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatNumber(row.solar_capacity_mw, 0)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatNumber(row.wind_capacity_mw, 0)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatNumber(row.co2_avoided_tonnes, 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No regional statistics are available.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Programme oversight"
                description="Platform activity relevant to policy delivery."
                icon={Users}
              />
              <CardBody className="space-y-2">
                {[
                  ["Green job listings", formatNumber(opportunities.jobs_count, 0)],
                  [
                    "Finance products",
                    formatNumber(opportunities.finance_schemes_count, 0),
                  ],
                  ["Recyclers listed", formatNumber(opportunities.recyclers_count, 0)],
                  [
                    "Recycling logged",
                    `${formatNumber(circularTotals.total_quantity_kg, 1)} kg`,
                  ],
                  [
                    "Community apartments",
                    formatNumber(community.apartments, 0),
                  ],
                  [
                    "Community bills issued",
                    formatNumber(community.bills, 0),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-slate-100 py-2 last:border-b-0"
                  >
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs font-semibold text-slate-800">
                      {value}
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link to="/jobs">
                    <Button variant="outline" size="sm">
                      <BriefcaseBusiness size={13} />
                      Jobs
                    </Button>
                  </Link>
                  <Link to="/finance">
                    <Button variant="outline" size="sm">
                      <Landmark size={13} />
                      Finance
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="Avoided emissions trend"
              description="Estimated CO₂ avoided by year."
              icon={Leaf}
              empty={!impactHistory.length}
              className="xl:col-span-2"
              footer="Avoided emissions use a planning emission factor supplied by the backend; they are estimates, not audited reductions."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={impactHistory}
                  margin={{ top: 8, right: 8, left: -4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="policyImpact"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#2d744c" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2d744c" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke={GRID_STROKE}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="year"
                    tick={AXIS_TICK}
                    axisLine={{ stroke: GRID_STROKE }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={(value) => formatNumber(value / 1_000_000, 1)}
                    unit="M"
                  />
                  <Tooltip content={<ChartTooltip unit=" t" />} />
                  <Area
                    type="monotone"
                    dataKey="co2_avoided_tonnes"
                    name="CO₂ avoided (t)"
                    stroke="#2d744c"
                    strokeWidth={2}
                    fill="url(#policyImpact)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card>
              <CardHeader
                title="Community solar oversight"
                description="The sample society module behind community policy."
                icon={Building2}
              />
              <CardBody className="space-y-2">
                {[
                  ["Apartments", community.apartments],
                  ["Simulation runs", community.simulation_runs],
                  ["Allocation runs", community.allocation_runs],
                  ["Bills issued", community.bills],
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
            <QuickActionsCard
              actions={quickActions}
              description="The oversight tools available to your role."
            />
            <NotificationsCard />
            <ActivityCard
              items={overview.data?.activity || []}
              description="Audit entries recorded against your policymaker account."
              emptyMessage="No policy audit activity yet."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
              Policy reporting combines bundled national sample aggregates with
              programme counts and community-solar records. Resident-level personal
              data is not exposed in this workspace.
            </p>
            <Link to="/impact">
              <Button variant="outline" size="sm">
                <Leaf size={13} />
                Open impact analysis
                <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
