import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Gauge,
  IndianRupee,
  PlayCircle,
  ReceiptText,
  ShieldCheck,
  Sun,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import StatCard from "../../components/ui/StatCard";
import BillingDisclaimer from "../../components/billing/BillingDisclaimer";
import BillingPageHeader from "../../components/billing/BillingPageHeader";
import BillingToolbar from "../../components/billing/BillingToolbar";
import BillsTable from "../../components/billing/BillsTable";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import { useAuth } from "../../context/AuthContext";
import { useBilling } from "../../context/BillingContext";
import {
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";

export default function BillingOverviewPage() {
  const { isAdmin } = useAuth();
  const {
    summary,
    summaryLoading,
    summaryError,
    refresh,
    config,
    disclaimer,
    latestPeriod,
  } = useBilling();

  const totals = summary?.totals;
  const bills = summary?.bills || [];
  const chartData = [...bills]
    .sort((left, right) => Number(right.net_payable) - Number(left.net_payable))
    .slice(0, 12)
    .map((bill) => ({
      flat: bill.apartment?.flat_number || "—",
      net_payable: Number(bill.net_payable),
      solar_credit: Number(bill.solar_credit),
    }));

  return (
    <div className="space-y-6">
      <BillingPageHeader
        icon={Gauge}
        title={isAdmin ? "BillFair billing overview" : "My solar bill overview"}
        description={
          isAdmin
            ? "Monthly society statements built from saved SolarEquity allocations. Every rupee is derived from PostgreSQL energy records and configurable tariff rules."
            : "Your apartment's monthly solar statement, internal solar credit and estimated savings. Access is restricted to the flat linked to your account."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isAdmin ? "info" : "success"} dot>
              <ShieldCheck size={11} />
              {isAdmin ? "Administrator view" : "Resident scoped"}
            </Badge>
            {isAdmin && (
              <Link to="/billing/generate">
                <Button size="sm">
                  <PlayCircle size={14} />
                  Generate bills
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <BillingToolbar
        onRefresh={refresh}
        refreshing={summaryLoading}
      />

      {summaryError && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Billing data unavailable"
              message={summaryError}
              onRetry={refresh}
            />
          </CardBody>
        </Card>
      )}

      {!summaryError && !summaryLoading && !bills.length && (
        <Card>
          <CardBody className="pt-5">
            <EmptyState
              icon={ReceiptText}
              title="No issued bills for this selection"
              description={
                isAdmin
                  ? "Use Generate bills to preview and issue statements for the saved allocation run."
                  : "Your bill will appear once the society administrator issues the monthly statement."
              }
              action={
                isAdmin ? (
                  <Link to="/billing/generate">
                    <Button size="sm">
                      <PlayCircle size={14} />
                      Generate bills
                    </Button>
                  </Link>
                ) : null
              }
            />
          </CardBody>
        </Card>
      )}

      {(summaryLoading || bills.length > 0) && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Net payable"
              value={formatCurrency(totals?.net_payable)}
              detail={`${formatNumber(totals?.apartment_count)} apartment statements`}
              icon={IndianRupee}
              tone="forest"
              loading={summaryLoading}
            />
            <StatCard
              label="Internal solar credit"
              value={formatCurrency(totals?.solar_credit)}
              detail={`${formatEnergy(totals?.solar_allocation_kwh, 2)} allocated solar`}
              icon={Sun}
              tone="emerald"
              loading={summaryLoading}
            />
            <StatCard
              label="Estimated savings"
              value={formatCurrency(totals?.estimated_savings)}
              detail="Avoided grid electricity at the applicable tariff"
              icon={ReceiptText}
              tone="sky"
              loading={summaryLoading}
            />
            <StatCard
              label="Solar coverage"
              value={formatPercent(totals?.solar_coverage_percentage, 2)}
              detail={`${formatEnergy(totals?.grid_import_kwh, 2)} grid import`}
              icon={Gauge}
              tone="amber"
              loading={summaryLoading}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Largest net payable statements"
                description="Top apartments in the selected billing period. Values are internal society statements."
                icon={Building2}
              />
              <CardBody className="pt-1">
                {chartData.length ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="flat" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={62} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="net_payable" name="Net payable (₹)" fill="#166534" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="solar_credit" name="Solar credit (₹)" fill="#34d399" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState compact title="No chart data" description="Issue bills to populate the overview." />
                )}
              </CardBody>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader
                  title="Current society rules"
                  description="Tariffs and credits are configured in PostgreSQL."
                  icon={CalendarDays}
                />
                <CardBody className="space-y-3 pt-1 text-xs">
                  {config.latest ? (
                    <>
                      <RuleRow label="Solar credit" value={`${formatCurrency(config.latest.solar_credit_rate_per_kwh)}/kWh`} />
                      <RuleRow label="Maintenance" value={`${formatCurrency(config.latest.maintenance_charge)}/month`} />
                      <RuleRow label="Other charges" value={`${formatCurrency(config.latest.other_charges)}/month`} />
                      <RuleRow label="Effective from" value={config.latest.effective_from} />
                    </>
                  ) : (
                    <p className="text-slate-500">
                      No billing configuration yet. Run the seed script or create a revision.
                    </p>
                  )}
                  <div className="border-t border-slate-100 pt-3">
                    <RuleRow
                      label="Electricity tariff"
                      value={
                        config.tariffs.length
                          ? `${formatCurrency(config.tariffs[config.tariffs.length - 1].price_per_kwh)}/kWh`
                          : "—"
                      }
                    />
                    <RuleRow
                      label="Tariff revisions"
                      value={formatNumber(config.tariffs.length)}
                    />
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Period and provenance"
                  description="Every bill references a saved allocation run."
                  icon={ShieldCheck}
                />
                <CardBody className="space-y-3 pt-1 text-xs">
                  <RuleRow label="Issued bills" value={formatNumber(summary?.bills_generated)} />
                  <RuleRow label="Apartments billed" value={formatNumber(summary?.apartments_billed)} />
                  <RuleRow label="Pending audit issues" value={formatNumber(summary?.pending_audit_issues)} />
                  <RuleRow label="Latest period" value={latestPeriod?.label || "—"} />
                  <RuleRow
                    label="Last audit"
                    value={
                      summary?.last_audit_at
                        ? new Date(summary.last_audit_at).toLocaleString("en-IN")
                        : "Not run"
                    }
                  />
                  <Link
                    to={isAdmin ? "/billing/audit" : "/billing/portal"}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-forest-700 hover:text-forest-900"
                  >
                    {isAdmin ? "Open billing audit" : "Open resident portal"}
                    <ArrowRight size={12} />
                  </Link>
                </CardBody>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader
              title={isAdmin ? "Apartment-wise bills" : "My bills"}
              description="Current issued statements for the selected period."
              icon={ReceiptText}
              action={
                <Link to="/billing/apartments">
                  <Button variant="outline" size="sm">
                    View all
                    <ArrowRight size={13} />
                  </Button>
                </Link>
              }
            />
            <CardBody className="pt-1">
              <BillsTable bills={bills} />
            </CardBody>
          </Card>

          <BillingDisclaimer text={disclaimer} />
        </>
      )}
    </div>
  );
}

function RuleRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value ?? "—"}</span>
    </div>
  );
}
