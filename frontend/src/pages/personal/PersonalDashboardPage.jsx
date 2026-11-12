import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Calculator,
  FileText,
  Home,
  Landmark,
  Leaf,
  ReceiptText,
  Recycle,
  Scale,
  Sun,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import {
  ActivityCard,
  NotificationsCard,
  QuickActionsCard,
  WelcomeBanner,
} from "../../components/dashboard/DashboardKit";
import ExportButton from "../../components/platform/ExportButton";
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
  formatEnergy,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import { getFlatBilling, getBillingSummary } from "../../services/billingService";
import {
  getDashboardOverview,
  getSolarCalculations,
} from "../../services/platformService";

function focusValue(item) {
  if (!item || item.value === null || item.value === undefined) return "—";
  if (item.unit === "%") return formatPercent(item.value, 2);
  return `${formatNumber(item.value, item.unit === "MW" ? 1 : 0)} ${
    item.unit || ""
  }`.trim();
}

export default function PersonalDashboardPage() {
  const { user } = useAuth();
  const hasFlat = Boolean(user?.apartment_id && user?.flat_number);

  const overview = useApiData(getDashboardOverview, []);
  const billing = useApiData(getBillingSummary, [], { enabled: hasFlat });
  const flatDetail = useApiData(
    () => (hasFlat ? getFlatBilling(user.flat_number) : Promise.resolve(null)),
    [hasFlat, user?.flat_number],
    { enabled: hasFlat }
  );
  const calculations = useApiData(
    () => getSolarCalculations({ limit: 20 }),
    []
  );

  if (overview.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="My home"
          icon={Home}
          title="My dashboard"
          description="Your personal energy, savings and rooftop view."
        />
        <ErrorState
          title="Your dashboard is unavailable"
          message={overview.error}
          onRetry={overview.reload}
        />
      </div>
    );
  }

  const loading = overview.loading && !overview.data;
  const bill = flatDetail.data?.bill || null;
  const totals = billing.data?.totals || {};
  const focus = Object.fromEntries(
    (overview.data?.role_focus || []).map((item) => [item.key, item])
  );
  const latest =
    overview.data?.solar?.latest || calculations.data?.items?.[0] || null;

  const billChart = (billing.data?.bills || [])
    .filter((item) => item.is_current)
    .slice()
    .sort((left, right) =>
      String(left.billing_period_end).localeCompare(
        String(right.billing_period_end)
      )
    )
    .slice(-6)
    .map((item) => ({
      period: item.billing_period_label,
      net_payable: item.net_payable,
      estimated_savings: item.estimated_savings,
    }));

  const quickActions = [
    {
      to: "/billing/portal",
      label: "My electricity bill",
      detail: "Current statement, solar credit and PDF",
      icon: ReceiptText,
    },
    {
      to: "/my/household",
      label: "Household energy",
      detail: "Consumption, solar allocation and grid import",
      icon: Zap,
    },
    {
      to: "/allocation",
      label: "Solar allocation",
      detail: "How your share of society solar is calculated",
      icon: Scale,
    },
    {
      to: "/solar-calculator",
      label: "Rooftop calculator",
      detail: "Estimate capacity, subsidy and payback",
      icon: Calculator,
    },
    {
      to: "/community",
      label: "Community hub",
      detail: "The 60-flat society solar modules",
      icon: Building2,
    },
    {
      to: "/jobs",
      label: "Green jobs",
      detail: "Renewable energy roles and applications",
      icon: BriefcaseBusiness,
    },
    {
      to: "/finance",
      label: "Green finance",
      detail: "Loans, subsidies and green schemes",
      icon: Landmark,
    },
    {
      to: "/circular",
      label: "Circular economy",
      detail: "Log panel and battery recycling",
      icon: Recycle,
    },
  ].filter((action) => canAccessPath(user, action.to));

  const reportRows = hasFlat
    ? (billing.data?.bills || []).map((item) => ({
        bill_number: item.bill_number,
        period: item.billing_period_label,
        consumption_kwh: item.consumption_kwh,
        solar_kwh: item.solar_allocation_kwh,
        net_payable: item.net_payable,
        estimated_savings: item.estimated_savings,
        solar_coverage_pct: item.solar_coverage_percentage,
        status: item.status,
      }))
    : (calculations.data?.items || []).map((item) => ({
        location: item.location,
        state: item.state,
        recommended_kwp: item.recommended_kwp,
        annual_savings: item.annual_savings,
        payback_years: item.payback_years,
        created_at: item.created_at,
      }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My home"
        icon={Home}
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description={
          hasFlat
            ? `Your apartment ${user.flat_number} statement, solar benefit and household energy in one place.`
            : "Your rooftop estimates, recycling log and opportunities. Link an apartment to unlock society billing and allocation."
        }
        actions={
          <>
            <Badge variant="success" dot>
              {user?.role === "RESIDENT" ? "Resident" : "Citizen"}
            </Badge>
            {hasFlat && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  billing.reload();
                  flatDetail.reload();
                  overview.reload();
                }}
                loading={billing.loading || flatDetail.loading}
              >
                Refresh
              </Button>
            )}
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
            eyebrow={hasFlat ? `Apartment ${user.flat_number}` : "Citizen workspace"}
            title={
              hasFlat
                ? "Your solar benefit, explained clearly"
                : "Start with a rooftop estimate"
            }
            description={
              hasFlat
                ? "Society solar credits and estimated savings are internal community benefits. Your official BESCOM bill remains separate."
                : "Your account is not linked to a society apartment, so personal billing and allocation are not shown. You can still plan rooftop solar and explore community modules."
            }
            user={user}
            badges={[
              hasFlat ? "Resident scoped" : "No apartment linked",
              "Sample society data",
            ]}
            stats={
              hasFlat
                ? [
                    {
                      label: "Net payable",
                      value: formatCurrency(bill?.net_payable ?? totals.net_payable),
                    },
                    {
                      label: "Solar coverage",
                      value: formatPercent(
                        bill?.solar_coverage_percentage ??
                          totals.solar_coverage_percentage,
                        1
                      ),
                    },
                    {
                      label: "Estimated savings",
                      value: formatCurrency(
                        bill?.estimated_savings ?? totals.estimated_savings
                      ),
                      wide: true,
                    },
                  ]
                : [
                    {
                      label: "Rooftop estimates",
                      value: formatNumber(
                        overview.data?.solar?.calculation_count ?? 0
                      ),
                    },
                    {
                      label: "Recycling logged",
                      value: `${formatNumber(
                        overview.data?.circular?.totals?.total_quantity_kg ?? 0,
                        1
                      )} kg`,
                    },
                    {
                      label: "Green job applications",
                      value: formatNumber(
                        overview.data?.opportunities?.applications_count ?? 0
                      ),
                      wide: true,
                    },
                  ]
            }
            actions={
              <>
                {hasFlat && (
                  <Link to="/billing/portal">
                    <Button variant="secondary" size="sm">
                      <ReceiptText size={13} />
                      My statement
                    </Button>
                  </Link>
                )}
                <Link to="/solar-calculator">
                  <Button
                    size="sm"
                    className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Calculator size={13} />
                    Rooftop calculator
                  </Button>
                </Link>
              </>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {hasFlat ? (
              <>
                <StatCard
                  label="Current statement"
                  value={bill?.billing_period_label || "Not issued"}
                  detail={
                    bill
                      ? `${formatCurrency(bill.net_payable)} net payable`
                      : "Bills appear after the administrator generates them"
                  }
                  icon={ReceiptText}
                  tone="forest"
                  loading={flatDetail.loading && !flatDetail.data}
                />
                <StatCard
                  label="Consumption"
                  value={formatEnergy(bill?.consumption_kwh)}
                  detail={`${formatEnergy(
                    bill?.grid_import_kwh
                  )} imported from the grid`}
                  icon={Zap}
                  tone="sky"
                  loading={flatDetail.loading && !flatDetail.data}
                />
                <StatCard
                  label="Solar allocated"
                  value={formatEnergy(bill?.solar_allocation_kwh)}
                  detail={`${formatPercent(
                    bill?.solar_coverage_percentage,
                    2
                  )} of consumption`}
                  icon={Sun}
                  tone="emerald"
                  loading={flatDetail.loading && !flatDetail.data}
                />
                <StatCard
                  label="Estimated savings"
                  value={formatCurrency(bill?.estimated_savings)}
                  detail={
                    bill
                      ? `No-solar baseline ${formatCurrency(
                          bill.no_solar_baseline_cost
                        )}`
                      : "Based on your issued statements"
                  }
                  icon={Leaf}
                  tone="amber"
                  loading={flatDetail.loading && !flatDetail.data}
                />
              </>
            ) : (
              <>
                <StatCard
                  label="Rooftop estimates"
                  value={formatNumber(
                    overview.data?.solar?.calculation_count ?? 0
                  )}
                  detail="Saved ROI and subsidy assessments"
                  icon={Calculator}
                  tone="forest"
                />
                <StatCard
                  label="Latest recommendation"
                  value={formatCapacity(latest?.recommended_kwp)}
                  detail={
                    latest
                      ? `${formatCurrency(
                          latest.annual_savings
                        )} estimated annual savings`
                      : "Run the rooftop calculator to begin"
                  }
                  icon={Sun}
                  tone="emerald"
                />
                <StatCard
                  label={focus.state_renewable?.label || "State renewable capacity"}
                  value={focusValue(focus.state_renewable)}
                  detail="Installed renewable capacity in the dataset"
                  icon={Zap}
                  tone="sky"
                />
                <StatCard
                  label="Recycling logged"
                  value={`${formatNumber(
                    overview.data?.circular?.totals?.total_quantity_kg ?? 0,
                    1
                  )} kg`}
                  detail={`${formatNumber(
                    overview.data?.circular?.totals?.recycled_quantity_kg ?? 0,
                    1
                  )} kg recovered`}
                  icon={Recycle}
                  tone="amber"
                />
              </>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              title="Monthly statement trend"
              description="Net payable and estimated savings across your issued statements."
              icon={TrendingUp}
              empty={!billChart.length}
              emptyTitle="No statements yet"
              emptyDescription="Once bills are generated for your flat, your monthly trend appears here."
              className="xl:col-span-2"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={billChart}
                  margin={{ top: 8, right: 8, left: -6, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke={GRID_STROKE}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="period"
                    tick={AXIS_TICK}
                    axisLine={{ stroke: GRID_STROKE }}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(value) => formatNumber(value, 0)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  <Bar
                    dataKey="net_payable"
                    name="Net payable"
                    fill="#2d744c"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="estimated_savings"
                    name="Estimated savings"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <Card>
              <CardHeader
                title="Your rooftop estimate"
                description="The latest assessment saved to your account."
                icon={Calculator}
                action={
                  <Link
                    to="/solar-calculator"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Open <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody className="space-y-3">
                {latest ? (
                  <>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                        Location
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        {latest.location}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Saved {formatDate(latest.created_at)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Recommended</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {formatCapacity(latest.recommended_kwp)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="text-[10px] text-slate-500">Payback</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {latest.payback_years === null ||
                          latest.payback_years === undefined
                            ? "—"
                            : `${formatNumber(latest.payback_years, 2)} y`}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                      <p className="text-[11px] text-emerald-800">
                        Estimated annual savings
                      </p>
                      <p className="mt-0.5 text-base font-semibold text-emerald-900">
                        {formatCurrency(latest.annual_savings)}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs leading-5 text-slate-500">
                      You have not saved a rooftop estimate yet. The calculator
                      sizes a system from your roof area, consumption, state tariff
                      and subsidy rules.
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
            <QuickActionsCard actions={quickActions} />

            <Card className="lg:col-span-2">
              <CardHeader
                title="Reports & downloads"
                description="Real statements and assessments from your account."
                icon={FileText}
                action={
                  <ExportButton
                    rows={reportRows}
                    filename={
                      hasFlat
                        ? "my-society-bills.csv"
                        : "my-rooftop-calculations.csv"
                    }
                    label={hasFlat ? "Export bills" : "Export estimates"}
                  />
                }
              />
              <CardBody>
                {hasFlat ? (
                  (billing.data?.bills || []).length ? (
                    <div className="overflow-x-auto scrollbar-thin">
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                            <th className="pb-2 font-semibold">Statement</th>
                            <th className="pb-2 font-semibold">Period</th>
                            <th className="pb-2 text-right font-semibold">Net payable</th>
                            <th className="pb-2 text-right font-semibold">Savings</th>
                            <th className="pb-2 text-right font-semibold">Coverage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(billing.data?.bills || []).slice(0, 6).map((item) => (
                            <tr
                              key={item.id || item.bill_number}
                              className="border-b border-slate-100 last:border-b-0"
                            >
                              <td className="py-2.5 font-medium text-slate-800">
                                {item.bill_number || "Preview"}
                              </td>
                              <td className="py-2.5 text-slate-600">
                                {item.billing_period_label}
                              </td>
                              <td className="py-2.5 text-right text-slate-700">
                                {formatCurrency(item.net_payable)}
                              </td>
                              <td className="py-2.5 text-right text-emerald-700">
                                {formatCurrency(item.estimated_savings)}
                              </td>
                              <td className="py-2.5 text-right text-slate-600">
                                {formatPercent(item.solar_coverage_percentage, 1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      No issued statements yet. Your society bill will appear here
                      after the administrator generates it.
                    </p>
                  )
                ) : (calculations.data?.items || []).length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[520px] text-left text-xs">
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
                        {(calculations.data?.items || []).slice(0, 6).map((item) => (
                          <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                            <td className="py-2.5 font-medium text-slate-800">
                              {item.location}
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
                    No saved rooftop estimates yet.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <NotificationsCard />
            <ActivityCard
              items={overview.data?.activity || []}
              description="Audit entries recorded against your account."
              emptyMessage="No personal audit activity yet."
            />
          </div>
        </>
      )}
    </div>
  );
}
