import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  Gauge,
  PlugZap,
  ReceiptText,
  Sun,
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
import { SampleNotice } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import {
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcShortDate,
} from "../../lib/formatters";
import { getAllocationDaily } from "../../services/allocationService";
import { getBillingSummary, getFlatBilling } from "../../services/billingService";

export default function HouseholdPage() {
  const { user } = useAuth();
  const hasFlat = Boolean(user?.apartment_id && user?.flat_number);

  const billing = useApiData(getBillingSummary, [], { enabled: hasFlat });
  const detail = useApiData(
    () => (hasFlat ? getFlatBilling(user.flat_number) : Promise.resolve(null)),
    [hasFlat, user?.flat_number],
    { enabled: hasFlat }
  );

  const bill = detail.data?.bill || null;
  const allocationRunId = bill?.allocation_run_id || null;

  const daily = useApiData(
    () =>
      getAllocationDaily({
        allocation_run_id: allocationRunId,
        flat_id: user.flat_number,
        limit: 500,
      }),
    [allocationRunId, user?.flat_number],
    { enabled: Boolean(allocationRunId && hasFlat) }
  );

  const dailyChart = (daily.data?.items || []).map((item) => ({
    period: item.period,
    consumption: item.consumption_kwh,
    solar: item.allocated_solar_kwh,
    grid: item.grid_import_kwh,
  }));

  if (!hasFlat) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="My home"
          icon={Zap}
          title="Household energy"
          description="Your apartment consumption, solar allocation and grid import."
        />
        <Card>
          <CardBody className="pt-5">
            <EmptyState
              icon={Building2}
              title="No apartment linked to this account"
              description="Household energy is scoped to the society apartment linked to your account. Ask an administrator to link your flat, or use the rooftop calculator for a personal estimate."
              action={
                <Link to="/solar-calculator">
                  <Button size="sm">Open rooftop calculator</Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My home"
        icon={Zap}
        title="Household energy"
        description={`How apartment ${user.flat_number} used grid and society solar in the current billing period. Every value comes from issued bills and stored allocation records.`}
        actions={
          <>
            <Badge variant="success" dot>
              Scoped to your flat
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                detail.reload();
                billing.reload();
                daily.reload();
              }}
              loading={detail.loading || daily.loading}
            >
              Refresh
            </Button>
          </>
        }
      />

      {(detail.error || billing.error) && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Household data unavailable"
              message={detail.error || billing.error}
              onRetry={() => {
                detail.reload();
                billing.reload();
              }}
            />
          </CardBody>
        </Card>
      )}

      {detail.loading && !detail.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index}>
              <CardBody className="space-y-2 pt-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-36" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : bill ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Consumption"
              value={formatEnergy(bill.consumption_kwh)}
              detail={bill.billing_period_label}
              icon={Zap}
              tone="forest"
            />
            <StatCard
              label="Solar allocated"
              value={formatEnergy(bill.solar_allocation_kwh)}
              detail={`${formatPercent(bill.solar_coverage_percentage, 2)} of consumption`}
              icon={Sun}
              tone="emerald"
            />
            <StatCard
              label="Grid import"
              value={formatEnergy(bill.grid_import_kwh)}
              detail={`${formatCurrency(bill.grid_charge)} grid charge`}
              icon={PlugZap}
              tone="amber"
            />
            <StatCard
              label="Estimated savings"
              value={formatCurrency(bill.estimated_savings)}
              detail={`Baseline ${formatCurrency(bill.no_solar_baseline_cost)}`}
              icon={ReceiptText}
              tone="sky"
            />
          </div>

          <ChartCard
            title="Daily consumption, solar and grid"
            description={`Allocation records for run #${allocationRunId} · ${bill.billing_period_label}.`}
            icon={CalendarDays}
            loading={daily.loading}
            error={daily.error}
            onRetry={daily.reload}
            empty={!dailyChart.length}
            emptyTitle="No daily allocation records"
            emptyDescription="Daily records appear when the selected allocation run contains complete days."
            footer="Values are stored SolarTwin and allocation records. No billing value is recalculated on this page."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dailyChart}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
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
                  minTickGap={24}
                  tickFormatter={formatUtcShortDate}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(value) => formatNumber(value, 0)}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(value) => formatUtcDate(value)}
                    />
                  }
                />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                <Bar
                  dataKey="consumption"
                  name="Consumption (kWh)"
                  fill="#94a3b8"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="solar"
                  name="Solar allocated (kWh)"
                  fill="#2d744c"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="grid"
                  name="Grid import (kWh)"
                  fill="#f59e0b"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Statement energy breakdown"
                description="Production values carried by the issued statement."
                icon={Gauge}
              />
              <CardBody className="space-y-0">
                <DetailRow label="Billing period">
                  {formatUtcDate(bill.billing_period_start)} –{" "}
                  {formatUtcDate(bill.billing_period_end)}
                </DetailRow>
                <DetailRow label="Consumption">
                  {formatEnergy(bill.consumption_kwh, 2)}
                </DetailRow>
                <DetailRow label="Solar allocated">
                  {formatEnergy(bill.solar_allocation_kwh, 2)}
                </DetailRow>
                <DetailRow label="Grid import">
                  {formatEnergy(bill.grid_import_kwh, 2)}
                </DetailRow>
                <DetailRow label="Solar coverage">
                  {formatPercent(bill.solar_coverage_percentage, 2)}
                </DetailRow>
                <DetailRow label="Hours aggregated">
                  {formatNumber(bill.hour_count)}
                </DetailRow>
                <DetailRow label="Allocation method">
                  {bill.allocation_method_label}
                </DetailRow>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Next steps"
                description="Everything related to this household record."
                icon={FileText}
              />
              <CardBody className="space-y-2">
                {[
                  {
                    to: "/billing/portal",
                    label: "Open my statement",
                    detail: "Download the PDF and see the full charge breakdown",
                    icon: ReceiptText,
                  },
                  {
                    to: "/allocation/apartments",
                    label: "Apartment allocation",
                    detail: "Daily and hourly records for your flat",
                    icon: Sun,
                  },
                  {
                    to: "/my/reports",
                    label: "Savings & reports",
                    detail: "Export your bills and rooftop estimates",
                    icon: FileText,
                  },
                ].map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.to}
                      to={action.to}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition hover:border-forest-200 hover:bg-forest-50/40"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon size={15} className="shrink-0 text-forest-700" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-800">
                            {action.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                            {action.detail}
                          </span>
                        </span>
                      </span>
                      <ArrowRight size={14} className="shrink-0 text-slate-400" />
                    </Link>
                  );
                })}
              </CardBody>
            </Card>
          </div>

          <SampleNotice title="Internal society accounting">
            Grid charges and solar credits on this page come from the society
            statement, not an official BESCOM bill. The statement is scoped to your
            linked apartment and cannot be changed from this workspace.
          </SampleNotice>
        </>
      ) : (
        <Card>
          <CardBody className="pt-5">
            <EmptyState
              icon={ReceiptText}
              title="No statement for the current period"
              description="Your household energy view is built from an issued statement. Once the administrator generates your society bill, consumption, solar allocation and grid import appear here."
              action={
                <Link to="/solar-calculator">
                  <Button variant="outline" size="sm">
                    Explore rooftop solar
                  </Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-xs last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}
