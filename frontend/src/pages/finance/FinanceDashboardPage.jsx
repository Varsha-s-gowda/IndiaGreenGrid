import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CloudSun,
  Factory,
  Landmark,
  Leaf,
  ShieldCheck,
  Sun,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { titleCaseToken } from "../../lib/constants";
import {
  formatCapacity,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  getDashboardOverview,
  getFinanceSchemes,
  getSolarCalculations,
} from "../../services/platformService";

const SCHEME_COLORS = [
  "#2d744c",
  "#3d8f60",
  "#5aa97a",
  "#84c29d",
  "#b7ddc7",
  "#d9efe2",
  "#94a3b8",
];

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

export default function FinanceDashboardPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);
  const catalogue = useApiData(() => getFinanceSchemes({ limit: 100 }), []);
  const assessments = useApiData(() => getSolarCalculations({ limit: 10 }), []);

  if (overview.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Green finance partner"
          icon={Landmark}
          title="Finance dashboard"
          description="Green finance pipeline, rooftop opportunity and market outlook."
        />
        <ErrorState
          title="Finance dashboard unavailable"
          message={overview.error}
          onRetry={overview.reload}
        />
      </div>
    );
  }

  const loading = overview.loading && !overview.data;
  const energy = overview.data?.energy;
  const totals = energy?.totals || {};
  const impactSummary = overview.data?.impact?.summary || {};
  const impactHistory = overview.data?.impact?.historical || [];
  const opportunities = overview.data?.opportunities || {};
  const focus = Object.fromEntries(
    (overview.data?.role_focus || []).map((item) => [item.key, item])
  );

  const schemes = catalogue.data?.items || [];
  const assessmentRows = assessments.data?.items || [];

  const schemeMix = Object.entries(
    schemes.reduce((accumulator, scheme) => {
      const key = titleCaseToken(scheme.scheme_type || "Other");
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const sourceChart = (energy?.sources || []).map((source) => ({
    name: source.source_name,
    capacity: source.installed_capacity_mw,
    generation: source.generation_gwh,
  }));

  const quickActions = [
    {
      to: "/finance",
      label: "Finance catalogue",
      detail: "Compare loans, subsidies, bonds and mechanisms",
      icon: Landmark,
    },
    {
      to: "/solar-calculator",
      label: "Rooftop assessments",
      detail: "Size and score rooftop solar opportunities",
      icon: Calculator,
    },
    {
      to: "/energy",
      label: "Energy market",
      detail: "Installed capacity, generation and renewable share",
      icon: Zap,
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
      detail: "Generation forecasting and battery sizing",
      icon: CloudSun,
    },
  ].filter((action) => canAccessPath(user, action.to));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Green finance partner"
        icon={Landmark}
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description={`Deal pipeline, verified finance products and renewable market context for ${
          user?.organization || "your institution"
        }.`}
        actions={
          <>
            <Badge variant="info" dot>
              Finance partner
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                overview.reload();
                catalogue.reload();
                assessments.reload();
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
            eyebrow="Green finance workspace"
            title="Verified products, real pipeline"
            description="The catalogue exposes only published schemes with verification status and rate provenance. Rooftop assessments and national energy data provide the market context behind each opportunity."
            user={user}
            badges={["Finance partner", "Verified catalogue"]}
            stats={[
              {
                label: "Finance products",
                value: focusValue(focus.finance_catalogue),
              },
              {
                label: "Rooftop assessments",
                value: focusValue(focus.solar_pipeline),
              },
              {
                label: "Renewable capacity",
                value: focusValue(focus.renewable_capacity),
                wide: true,
              },
            ]}
            actions={
              <>
                <Link to="/finance">
                  <Button variant="secondary" size="sm">
                    <Landmark size={13} />
                    Finance catalogue
                  </Button>
                </Link>
                <Link to="/solar-calculator">
                  <Button
                    size="sm"
                    className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Calculator size={13} />
                    Assess a rooftop
                  </Button>
                </Link>
              </>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Finance products"
              value={formatNumber(
                focus.finance_catalogue?.value ?? catalogue.data?.total,
                0
              )}
              detail={`${formatNumber(opportunities.finance_schemes_count, 0)} active schemes`}
              icon={Landmark}
              tone="forest"
            />
            <StatCard
              label="Platform rooftop assessments"
              value={formatNumber(focus.solar_pipeline?.value, 0)}
              detail={`${formatNumber(
                assessmentRows.length,
                0
              )} saved on your account`}
              icon={Calculator}
              tone="emerald"
            />
            <StatCard
              label="Renewable capacity"
              value={`${formatNumber(totals.renewable_capacity_mw, 0)} MW`}
              detail={`${formatPercent(
                totals.renewable_capacity_share_pct,
                1
              )} of installed capacity`}
              icon={Zap}
              tone="sky"
            />
            <StatCard
              label="CO₂ avoided"
              value={`${formatNumber(
                impactSummary.co2_avoided_million_tonnes,
                3
              )} Mt`}
              detail="Estimated from renewable generation"
              icon={Leaf}
              tone="amber"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="Renewable capacity by source"
              description="Where the national pipeline is concentrated."
              icon={BarChart3}
              empty={!sourceChart.length}
              className="xl:col-span-2"
              footer="Installed capacity for the selected sample year."
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sourceChart}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke={GRID_STROKE}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={AXIS_TICK}
                    axisLine={{ stroke: GRID_STROKE }}
                    tickLine={false}
                    interval={0}
                    angle={-24}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(value) => formatNumber(value, 0)}
                  />
                  <Tooltip content={<ChartTooltip unit=" MW" />} />
                  <Bar
                    dataKey="capacity"
                    name="Installed capacity (MW)"
                    fill="#2d744c"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={38}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Catalogue mix"
              description="Published products by scheme type."
              icon={Landmark}
              empty={!schemeMix.length}
              footer={`${formatNumber(
                catalogue.data?.total,
                0
              )} products in the published catalogue.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={schemeMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="50%"
                    outerRadius="80%"
                    paddingAngle={1}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  >
                    {schemeMix.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={SCHEME_COLORS[index % SCHEME_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: 10, lineHeight: "16px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <Card>
            <CardHeader
              title="Green finance catalogue"
              description="Only published schemes are shown. Rates carry their verification status."
              icon={ShieldCheck}
              action={
                <ExportButton
                  rows={schemes}
                  filename="green-finance-catalogue.csv"
                />
              }
            />
            <CardBody>
              {schemes.length ? (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                        <th className="pb-2 font-semibold">Scheme</th>
                        <th className="pb-2 font-semibold">Provider</th>
                        <th className="pb-2 font-semibold">Type</th>
                        <th className="pb-2 text-right font-semibold">Rate</th>
                        <th className="pb-2 text-right font-semibold">Max amount</th>
                        <th className="pb-2 text-right font-semibold">Tenure</th>
                        <th className="pb-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schemes.slice(0, 10).map((scheme) => (
                        <tr
                          key={scheme.id}
                          className="border-b border-slate-100 last:border-b-0"
                        >
                          <td className="py-2.5">
                            <p className="font-medium text-slate-800">
                              {scheme.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {scheme.category}
                            </p>
                          </td>
                          <td className="py-2.5 text-slate-600">
                            {scheme.provider}
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
                          <td className="py-2.5 text-right text-slate-600">
                            {scheme.tenure_months_min === null &&
                            scheme.tenure_months_max === null
                              ? "Not specified"
                              : `${scheme.tenure_months_min ?? "—"}–${
                                  scheme.tenure_months_max ?? "—"
                                } m`}
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <StatusBadge value={scheme.verification_status} />
                              <Badge
                                variant={scheme.rate_verified ? "success" : "warning"}
                              >
                                {scheme.rate_verified ? "Rate verified" : "Rate unverified"}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No published finance schemes are available yet.
                </p>
              )}
              {catalogue.error && (
                <p className="mt-2 text-[11px] text-rose-600">{catalogue.error}</p>
              )}
              <Link to="/finance">
                <Button variant="outline" size="sm" className="mt-3">
                  <Landmark size={13} />
                  Open full catalogue
                  <ArrowRight size={13} />
                </Button>
              </Link>
            </CardBody>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Rooftop assessment pipeline"
                description="Assessments saved from your account, newest first."
                icon={Calculator}
                action={
                  <Link
                    to="/solar-calculator"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    New assessment <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                {assessmentRows.length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                          <th className="pb-2 font-semibold">Location</th>
                          <th className="pb-2 text-right font-semibold">Capacity</th>
                          <th className="pb-2 text-right font-semibold">Annual savings</th>
                          <th className="pb-2 text-right font-semibold">Payback</th>
                          <th className="pb-2 text-right font-semibold">Saved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessmentRows.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-100 last:border-b-0"
                          >
                            <td className="py-2.5">
                              <p className="font-medium text-slate-800">
                                {item.location}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {item.state}
                              </p>
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatCapacity(item.recommended_kwp)}
                            </td>
                            <td className="py-2.5 text-right text-slate-700">
                              {formatCurrency(item.annual_savings)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {item.payback_years === null ||
                              item.payback_years === undefined
                                ? "—"
                                : `${formatNumber(item.payback_years, 2)} y`}
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
                    No rooftop assessments saved yet. The calculator sizes a system
                    from roof area, consumption, tariff and state subsidy rules.
                  </p>
                )}
                {assessments.error && (
                  <p className="mt-2 text-[11px] text-rose-600">
                    {assessments.error}
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Market context"
                description="National renewable and impact indicators."
                icon={TrendingUp}
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
                  ["CO₂ avoided", `${formatNumber(impactSummary.co2_avoided_million_tonnes, 3)} Mt`],
                  [
                    "Trees equivalent",
                    formatNumber(impactSummary.trees_equivalent, 0),
                  ],
                  [
                    "Recyclers listed",
                    formatNumber(opportunities.recyclers_count, 0),
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
              title="Avoided emissions trend"
              description="Estimated CO₂ avoided by year."
              icon={Leaf}
              empty={!impactHistory.length}
              className="xl:col-span-2"
              footer="Avoided emissions use the backend planning emission factor."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={impactHistory}
                  margin={{ top: 8, right: 8, left: -4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="financeImpact"
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
                    fill="url(#financeImpact)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card>
              <CardHeader
                title="Latest assessment"
                description="The most recent rooftop opportunity you saved."
                icon={Sun}
              />
              <CardBody className="space-y-3">
                {assessmentRows[0] ? (
                  <>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        Location
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        {assessmentRows[0].location}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Saved {formatDate(assessmentRows[0].created_at)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Recommended</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {formatCapacity(assessmentRows[0].recommended_kwp)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Payback</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {assessmentRows[0].payback_years === null ||
                          assessmentRows[0].payback_years === undefined
                            ? "—"
                            : `${formatNumber(
                                assessmentRows[0].payback_years,
                                2
                              )} y`}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                      <p className="text-[11px] text-emerald-800">
                        Estimated annual savings
                      </p>
                      <p className="mt-0.5 text-base font-semibold text-emerald-900">
                        {formatCurrency(assessmentRows[0].annual_savings)}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs leading-5 text-slate-500">
                      You have not saved a rooftop assessment yet. Use the
                      calculator to size a system and score its financial case.
                    </p>
                    <Link to="/solar-calculator">
                      <Button variant="secondary" size="sm" className="w-full">
                        <Calculator size={13} />
                        Run the calculator
                      </Button>
                    </Link>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <QuickActionsCard
              actions={quickActions}
              description="The finance-partner actions available to you."
            />
            <NotificationsCard />
            <ActivityCard
              items={overview.data?.activity || []}
              description="Audit entries recorded against your finance account."
              emptyMessage="No finance audit activity yet."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
              Finance reporting combines published catalogue entries with national
              sample aggregates and the rooftop assessments stored on your account.
              Rate verification is shown explicitly; nothing is presented as
              guaranteed.
            </p>
            <Link to="/finance">
              <Button variant="outline" size="sm">
                <Factory size={13} />
                Open finance catalogue
                <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
