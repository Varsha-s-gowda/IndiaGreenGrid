import { Link } from "react-router-dom";
import {
  ArrowRight,
  BatteryCharging,
  Building2,
  Calculator,
  CloudSun,
  Database,
  Gauge,
  Leaf,
  Ruler,
  Sun,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import { FreshnessStrip, StatusBadge } from "../../components/platform/DataBadges";
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
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  getDashboardOverview,
  getForecastHistory,
} from "../../services/platformService";

function focusValue(item) {
  if (!item || item.value === null || item.value === undefined) return "Not recorded";
  if (item.unit === "%") return formatPercent(item.value, 2);
  return `${formatNumber(item.value, item.unit === "MW" || item.unit === "MWh" ? 1 : 0)} ${
    item.unit || ""
  }`.trim();
}

export default function DiscomDashboardPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);
  const forecasts = useApiData(getForecastHistory, []);

  if (overview.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="DISCOM operations"
          icon={Building2}
          title="DISCOM dashboard"
          description="Distribution, compliance and renewable integration."
        />
        <ErrorState
          title="DISCOM dashboard unavailable"
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
  const focus = Object.fromEntries(
    (overview.data?.role_focus || []).map((item) => [item.key, item])
  );
  const mix = (energy?.sources || []).map((source) => ({
    name: source.source_name,
    value: source.installed_capacity_mw,
    color: source.color,
  }));
  const forecastItems = forecasts.data?.items || [];

  const regionalRows = overview.data?.regional || [];
  const rpoRows = rpo?.yearly_tracker || [];

  const quickActions = [
    {
      to: "/energy",
      label: "Demand & supply analytics",
      detail: "Installed capacity, generation and renewable share",
      icon: Zap,
    },
    {
      to: "/rpo",
      label: "RPO compliance tracker",
      detail: "Targets, recorded compliance and shortfall",
      icon: Target,
    },
    {
      to: "/forecast",
      label: "Renewable integration",
      detail: "Forecast and storage planning",
      icon: CloudSun,
    },
    {
      to: "/impact",
      label: "Environmental impact",
      detail: "Avoided emissions and regional comparison",
      icon: Leaf,
    },
    {
      to: "/community",
      label: "Community solar monitoring",
      detail: "Society generation, allocation and billing",
      icon: Building2,
    },
    {
      to: "/simulation",
      label: "SolarTwin simulation",
      detail: "Hourly generation and demand readings",
      icon: Sun,
    },
    {
      to: "/roofmax",
      label: "Rooftop optimisation",
      detail: "Capacity scenarios and financial analysis",
      icon: Ruler,
    },
    {
      to: "/solarvault",
      label: "Battery dispatch",
      detail: "Storage sizing and before/after grid import",
      icon: BatteryCharging,
    },
    {
      to: "/discom/reports",
      label: "Operational reports",
      detail: "Exportable compliance and regional tables",
      icon: Gauge,
    },
  ].filter((action) => canAccessPath(user, action.to));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="DISCOM operations"
        icon={Building2}
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description="A distribution-utility view of renewable capacity, RPO compliance, integration planning and community solar operations."
        actions={
          <>
            <Badge variant="warning" dot>
              DISCOM operations
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                overview.reload();
                forecasts.reload();
              }}
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
            eyebrow={`${user?.state || "National"} distribution operations`}
            title="Grid readiness and renewable compliance"
            description="Monitor renewable capacity, your recorded purchase obligations and the community-solar assets on your network. National figures are bundled sample public aggregates."
            user={user}
            badges={["DISCOM scoped", "Sample public datasets"]}
            stats={[
              {
                label: "RPO compliance",
                value: focusValue(focus.rpo_compliance),
              },
              {
                label: "Renewable shortfall",
                value: focusValue(focus.rpo_shortfall),
              },
              {
                label: "Renewable capacity",
                value: formatNumber(totals.renewable_capacity_mw, 0),
                unit: "MW",
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
              label="RPO compliance"
              value={focusValue(focus.rpo_compliance)}
              detail="Across your recorded DISCOM obligations"
              icon={Target}
              tone="emerald"
            />
            <StatCard
              label="Renewable shortfall"
              value={focusValue(focus.rpo_shortfall)}
              detail="Recorded shortfall against RPO targets"
              icon={Gauge}
              tone="amber"
            />
            <StatCard
              label="Renewable capacity"
              value={`${formatNumber(totals.renewable_capacity_mw, 0)} MW`}
              detail={`${formatPercent(
                totals.renewable_capacity_share_pct,
                1
              )} of installed capacity`}
              icon={Zap}
              tone="forest"
            />
            <StatCard
              label="Renewable generation"
              value={`${formatNumber(totals.renewable_generation_gwh, 0)} GWh`}
              detail={`Selected year ${energy?.selected_year || "—"}`}
              icon={Sun}
              tone="sky"
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
                    <linearGradient id="discomCapacity" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#discomCapacity)"
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
              description={`Installed capacity by source in ${energy?.selected_year || "the latest year"}.`}
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
              description="Required renewable energy and recorded compliance by year."
              icon={Target}
              empty={!rpoRows.length}
              className="xl:col-span-2"
              action={
                <ExportButton rows={rpoRows} filename="discom-rpo-tracker.csv" />
              }
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
                title="Community solar assets"
                description="The 60-flat society module on your network."
                icon={Building2}
                action={<Badge variant="forest">Sample society</Badge>}
              />
              <CardBody className="space-y-2">
                {[
                  ["Apartments", overview.data?.community_solar?.apartments],
                  ["Simulation runs", overview.data?.community_solar?.simulation_runs],
                  ["Allocation runs", overview.data?.community_solar?.allocation_runs],
                  ["Bills issued", overview.data?.community_solar?.bills],
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
                title="Regional renewable leaders"
                description="Top states by renewable capacity in the latest sample year."
                icon={Leaf}
                action={
                  <ExportButton
                    rows={regionalRows}
                    filename="discom-regional-renewables.csv"
                  />
                }
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
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="RPO status"
                description="Compliance state of recorded targets."
                icon={Target}
              />
              <CardBody className="space-y-2">
                {[
                  ["Overall compliance", formatPercent(rpo?.summary?.overall_compliance_pct, 2)],
                  ["Targets", formatNumber(rpo?.summary?.target_count, 0)],
                  ["Compliant", formatNumber(rpo?.summary?.compliant_count, 0)],
                  ["At risk", formatNumber(rpo?.summary?.at_risk_count, 0)],
                  ["Non-compliant", formatNumber(rpo?.summary?.non_compliant_count, 0)],
                  ["Shortfall", `${formatNumber(rpo?.summary?.total_shortfall_mwh, 0)} MWh`],
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
                    <span key={status} className="inline-flex items-center gap-1">
                      <StatusBadge value={status} />
                      <span className="text-[10px] text-slate-500">{count}</span>
                    </span>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Recent storage recommendations"
              description="Forecast and battery sizing estimates generated from your account."
              icon={BatteryCharging}
              action={<Badge variant="info">Estimated</Badge>}
            />
            <CardBody>
              {forecastItems.length ? (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                        <th className="pb-2 font-semibold">Location</th>
                        <th className="pb-2 text-right font-semibold">Solar</th>
                        <th className="pb-2 text-right font-semibold">Wind</th>
                        <th className="pb-2 text-right font-semibold">Daily demand</th>
                        <th className="pb-2 text-right font-semibold">Battery</th>
                        <th className="pb-2 text-right font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecastItems.slice(0, 6).map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-2.5">
                            <p className="font-medium text-slate-800">{item.location}</p>
                            <p className="text-[10px] text-slate-400">{item.state}</p>
                          </td>
                          <td className="py-2.5 text-right text-slate-600">
                            {formatNumber(item.solar_kwp, 1)} kWp
                          </td>
                          <td className="py-2.5 text-right text-slate-600">
                            {formatNumber(item.wind_kwp, 1)} kWp
                          </td>
                          <td className="py-2.5 text-right text-slate-600">
                            {formatNumber(item.daily_consumption_kwh, 1)} kWh
                          </td>
                          <td className="py-2.5 text-right font-medium text-slate-800">
                            {formatNumber(item.recommended_battery_kwh, 1)} kWh
                          </td>
                          <td className="py-2.5 text-right text-slate-500">
                            {formatDate(item.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No storage recommendations yet. Use the forecast planner to size
                  renewable integration.
                </p>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <QuickActionsCard actions={quickActions} />
            <NotificationsCard />
            <ActivityCard
              items={overview.data?.activity || []}
              description="Audit entries recorded against your DISCOM account."
              emptyMessage="No DISCOM audit activity yet."
            />
          </div>

          <Card>
            <CardHeader
              title="Data provenance"
              description="Configured sources, labelled honestly."
              icon={Database}
              action={
                <Badge
                  variant={
                    overview.data?.data_summary?.unavailable ? "warning" : "success"
                  }
                >
                  {overview.data?.data_summary?.fresh ?? 0} fresh ·{" "}
                  {overview.data?.data_summary?.unavailable ?? 0} unavailable
                </Badge>
              }
            />
            <CardBody>
              <FreshnessStrip items={overview.data?.data_freshness || []} compact />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
              DISCOM reports contain only national analytics, your recorded RPO
              obligations and scoped operational data. Community figures are sample
              society records.
            </p>
            <Link to="/discom/reports">
              <Button variant="outline" size="sm">
                <Calculator size={13} />
                Open operational reports
                <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
