import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CloudSun,
  Factory,
  Landmark,
  Leaf,
  Recycle,
  Sun,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  formatCapacity,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import { titleCaseToken } from "../../lib/constants";
import {
  getDashboardOverview,
  getFinanceSchemes,
  getJobs,
} from "../../services/platformService";

function focusValue(item) {
  if (!item || item.value === null || item.value === undefined) return "Not recorded";
  if (item.unit === "%") return formatPercent(item.value, 2);
  return `${formatNumber(item.value, item.unit === "MW" ? 1 : 0)} ${
    item.unit || ""
  }`.trim();
}

function rateLabel(scheme) {
  if (scheme.interest_rate_min === null && scheme.interest_rate_max === null) {
    return "Not applicable";
  }
  if (scheme.interest_rate_min === scheme.interest_rate_max) {
    return `${formatPercent(scheme.interest_rate_min, 2)} p.a.`;
  }
  return `${formatPercent(scheme.interest_rate_min, 2)} – ${formatPercent(
    scheme.interest_rate_max,
    2
  )} p.a.`;
}

export default function IndustryDashboardPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);
  const schemes = useApiData(() => getFinanceSchemes({ limit: 5 }), []);
  const jobs = useApiData(() => getJobs({ limit: 5 }), []);

  if (overview.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Industrial consumer"
          icon={Factory}
          title="Industry dashboard"
          description="Compliance, energy outlook and green finance for your operations."
        />
        <ErrorState
          title="Industry dashboard unavailable"
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
  const circular = overview.data?.circular || {};
  const circularTotals = circular.totals || {};
  const solar = overview.data?.solar || {};
  const opportunities = overview.data?.opportunities || {};
  const impactSummary = overview.data?.impact?.summary || {};
  const focus = Object.fromEntries(
    (overview.data?.role_focus || []).map((item) => [item.key, item])
  );

  const rpoRows = rpo?.yearly_tracker || [];
  const categoryRows = (circular.by_category || []).filter(
    (row) => row.quantity_kg > 0
  );
  const schemeRows = schemes.data?.items || [];
  const jobRows = jobs.data?.items || [];

  const quickActions = [
    {
      to: "/rpo",
      label: "RPO compliance",
      detail: "Recorded obligations, compliance and shortfall",
      icon: Target,
    },
    {
      to: "/energy",
      label: "Energy outlook",
      detail: "National capacity, generation and renewable share",
      icon: Zap,
    },
    {
      to: "/forecast",
      label: "Forecast & storage",
      detail: "Plan renewable generation and battery sizing",
      icon: CloudSun,
    },
    {
      to: "/finance",
      label: "Green finance",
      detail: "Loans, subsidies and green market mechanisms",
      icon: Landmark,
    },
    {
      to: "/circular",
      label: "Circular economy",
      detail: "Log panel, e-waste and battery recycling",
      icon: Recycle,
    },
    {
      to: "/solar-calculator",
      label: "Rooftop assessment",
      detail: "Size rooftop solar for a facility",
      icon: Calculator,
    },
    {
      to: "/jobs",
      label: "Green jobs",
      detail: "Renewable roles and your applications",
      icon: BriefcaseBusiness,
    },
    {
      to: "/impact",
      label: "Environmental impact",
      detail: "Avoided emissions and regional comparison",
      icon: Leaf,
    },
  ].filter((action) => canAccessPath(user, action.to));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Industrial consumer"
        icon={Factory}
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description={`Renewable compliance, procurement outlook and green finance for ${
          user?.organization || "your operations"
        }.`}
        actions={
          <>
            <Badge variant="forest" dot>
              Industry workspace
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                overview.reload();
                schemes.reload();
                jobs.reload();
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
            eyebrow={`${user?.state || "National"} industrial operations`}
            title="Compliance and procurement in one view"
            description="Your recorded renewable purchase obligations sit alongside the national capacity outlook, recycling log and finance options relevant to industrial consumers. National figures are bundled sample public aggregates."
            user={user}
            badges={["Industry scoped", "Sample public datasets"]}
            stats={[
              {
                label: "Your RPO compliance",
                value: focusValue(focus.rpo_compliance),
              },
              {
                label: "Waste recycled",
                value: focusValue(focus.recycling),
              },
              {
                label: "National renewable share",
                value: focusValue(focus.renewable_share),
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
                <Link to="/finance">
                  <Button
                    size="sm"
                    className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Landmark size={13} />
                    Green finance
                  </Button>
                </Link>
              </>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="RPO compliance"
              value={focusValue(focus.rpo_compliance)}
              detail={`${formatNumber(
                rpo?.summary?.target_count,
                0
              )} recorded obligations`}
              icon={Target}
              tone="emerald"
            />
            <StatCard
              label="Recorded shortfall"
              value={`${formatNumber(rpo?.summary?.total_shortfall_mwh, 0)} MWh`}
              detail={`${formatNumber(
                rpo?.summary?.at_risk_count,
                0
              )} obligations at risk`}
              icon={TrendingUp}
              tone="amber"
            />
            <StatCard
              label="Waste recycled"
              value={`${formatNumber(circularTotals.recycled_quantity_kg, 1)} kg`}
              detail={`${formatPercent(
                circularTotals.recycling_rate_pct,
                1
              )} of logged waste`}
              icon={Recycle}
              tone="forest"
            />
            <StatCard
              label="Facility assessments"
              value={formatNumber(solar.calculation_count, 0)}
              detail={
                solar.latest
                  ? `Latest ${formatCapacity(solar.latest.recommended_kwp)} at ${
                      solar.latest.location
                    }`
                  : "Run the rooftop calculator to begin"
              }
              icon={Calculator}
              tone="sky"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="National capacity trajectory"
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
                      id="industryCapacity"
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
                    fill="url(#industryCapacity)"
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

            <Card>
              <CardHeader
                title="Procurement snapshot"
                description="The national renewable mix for your planning."
                icon={Zap}
                action={<Badge variant="info">{energy?.selected_year || "—"}</Badge>}
              />
              <CardBody className="space-y-2">
                {[
                  [
                    "Renewable capacity",
                    `${formatNumber(totals.renewable_capacity_mw, 0)} MW`,
                  ],
                  [
                    "Renewable share",
                    formatPercent(totals.renewable_capacity_share_pct, 1),
                  ],
                  [
                    "Renewable generation",
                    `${formatNumber(totals.renewable_generation_gwh, 0)} GWh`,
                  ],
                  [
                    "CO₂ avoided",
                    `${formatNumber(
                      impactSummary.co2_avoided_million_tonnes,
                      3
                    )} Mt`,
                  ],
                  [
                    "Solar assessments saved",
                    formatNumber(solar.calculation_count, 0),
                  ],
                  [
                    "Finance products",
                    formatNumber(opportunities.finance_schemes_count, 0),
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
                <Link to="/energy">
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    <Zap size={13} />
                    Open energy analytics
                  </Button>
                </Link>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="RPO yearly tracker"
              description="Required renewable energy and recorded compliance by year."
              icon={Target}
              empty={!rpoRows.length}
              className="xl:col-span-2"
              action={
                <ExportButton rows={rpoRows} filename="industry-rpo-tracker.csv" />
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

            <ChartCard
              title="Waste logged by category"
              description="Recycling records linked to your account."
              icon={Recycle}
              empty={!categoryRows.length}
              footer={
                circular.note ||
                "Recycling quantities are recorded transactions, not audited yields."
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryRows}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke={GRID_STROKE}
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => formatNumber(value, 0)}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={92}
                    tickFormatter={titleCaseToken}
                  />
                  <Tooltip content={<ChartTooltip unit=" kg" />} />
                  <Bar
                    dataKey="quantity_kg"
                    name="Logged (kg)"
                    fill="#3d8f60"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Green finance options"
                description="Loans, subsidies and mechanisms available to industry."
                icon={Landmark}
                action={
                  <Link
                    to="/finance"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Catalogue <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                {schemeRows.length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                          <th className="pb-2 font-semibold">Scheme</th>
                          <th className="pb-2 font-semibold">Type</th>
                          <th className="pb-2 text-right font-semibold">Rate</th>
                          <th className="pb-2 text-right font-semibold">Max amount</th>
                          <th className="pb-2 text-right font-semibold">Verified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schemeRows.map((scheme) => (
                          <tr
                            key={scheme.id}
                            className="border-b border-slate-100 last:border-b-0"
                          >
                            <td className="py-2.5">
                              <p className="font-medium text-slate-800">
                                {scheme.name}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {scheme.provider}
                              </p>
                            </td>
                            <td className="py-2.5 text-slate-600">
                              {titleCaseToken(scheme.scheme_type)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {rateLabel(scheme)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {scheme.max_amount
                                ? formatCurrency(scheme.max_amount)
                                : "Not specified"}
                            </td>
                            <td className="py-2.5 text-right">
                              <Badge
                                variant={scheme.rate_verified ? "success" : "warning"}
                              >
                                {scheme.rate_verified ? "Verified" : "Unverified"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No finance schemes are available yet.
                  </p>
                )}
                {schemes.error && (
                  <p className="mt-2 text-[11px] text-rose-600">{schemes.error}</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Green jobs for industry"
                description="Open renewable energy roles and your application count."
                icon={BriefcaseBusiness}
                action={
                  <Badge variant="neutral">
                    {formatNumber(opportunities.applications_count, 0)} applied
                  </Badge>
                }
              />
              <CardBody>
                {jobRows.length ? (
                  <ul className="space-y-2">
                    {jobRows.map((job) => (
                      <li
                        key={job.id}
                        className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {job.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {job.organization} · {job.location}, {job.state}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="neutral">
                            {titleCaseToken(job.employment_type)}
                          </Badge>
                          <StatusBadge value={job.verification_status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    No active job listings are available yet.
                  </p>
                )}
                {jobs.error && (
                  <p className="mt-2 text-[11px] text-rose-600">{jobs.error}</p>
                )}
                <Link to="/jobs">
                  <Button variant="outline" size="sm" className="mt-3 w-full">
                    <BriefcaseBusiness size={13} />
                    Open green jobs
                  </Button>
                </Link>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="RPO obligations"
                description="Status of every target recorded for your organisation."
                icon={Target}
                action={
                  <ExportButton
                    rows={rpo?.targets || []}
                    filename="industry-rpo-obligations.csv"
                  />
                }
              />
              <CardBody>
                {(rpo?.targets || []).length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                          <th className="pb-2 font-semibold">Entity</th>
                          <th className="pb-2 font-semibold">State</th>
                          <th className="pb-2 text-right font-semibold">Year</th>
                          <th className="pb-2 text-right font-semibold">Required MWh</th>
                          <th className="pb-2 text-right font-semibold">Compliance</th>
                          <th className="pb-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rpo?.targets || []).slice(0, 8).map((target) => (
                          <tr
                            key={target.target_id || `${target.entity_name}-${target.year}`}
                            className="border-b border-slate-100 last:border-b-0"
                          >
                            <td className="py-2.5 font-medium text-slate-800">
                              {target.entity_name}
                            </td>
                            <td className="py-2.5 text-slate-600">{target.state}</td>
                            <td className="py-2.5 text-right text-slate-600">
                              {target.year}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatNumber(target.required_mwh, 2)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {target.compliance_pct === null ||
                              target.compliance_pct === undefined
                                ? "—"
                                : formatPercent(target.compliance_pct, 2)}
                            </td>
                            <td className="py-2.5">
                              <StatusBadge value={target.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No RPO obligations are recorded for this account yet.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Circular economy log"
                description="Waste recorded against your account."
                icon={Recycle}
                action={
                  <Link
                    to="/circular"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Open <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody className="space-y-2">
                {[
                  [
                    "Total logged",
                    `${formatNumber(circularTotals.total_quantity_kg, 1)} kg`,
                  ],
                  [
                    "Recycled",
                    `${formatNumber(circularTotals.recycled_quantity_kg, 1)} kg`,
                  ],
                  [
                    "In progress",
                    `${formatNumber(
                      circularTotals.in_progress_quantity_kg,
                      1
                    )} kg`,
                  ],
                  [
                    "Material recovered",
                    `${formatNumber(
                      circularTotals.recorded_material_recovery_kg,
                      1
                    )} kg`,
                  ],
                  [
                    "CO₂ saved (estimated)",
                    `${formatNumber(circularTotals.estimated_co2_saved_kg, 1)} kg`,
                  ],
                  [
                    "Transactions",
                    formatNumber(circularTotals.transaction_count, 0),
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
              </CardBody>
            </Card>
          </div>

          {solar.latest && (
            <Card>
              <CardHeader
                title="Latest facility assessment"
                description="Your most recent rooftop estimate."
                icon={Sun}
                action={<Badge variant="info">Saved {formatDate(solar.latest.created_at)}</Badge>}
              />
              <CardBody className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Location", solar.latest.location || "—"],
                  ["Recommended capacity", formatCapacity(solar.latest.recommended_kwp)],
                  ["Estimated annual savings", formatCurrency(solar.latest.annual_savings)],
                  [
                    "Payback",
                    solar.latest.payback_years === null ||
                    solar.latest.payback_years === undefined
                      ? "—"
                      : `${formatNumber(solar.latest.payback_years, 2)} years`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {value}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <QuickActionsCard actions={quickActions} />
            <NotificationsCard />
            <ActivityCard
              items={overview.data?.activity || []}
              description="Audit entries recorded against your industry account."
              emptyMessage="No industry audit activity yet."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
              Industry reporting combines national sample aggregates with the RPO
              targets, recycling records and assessments stored for your own
              account. Nothing is fabricated when a source is unavailable.
            </p>
            <Link to="/circular">
              <Button variant="outline" size="sm">
                <Building2 size={13} />
                Open circular economy
                <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
