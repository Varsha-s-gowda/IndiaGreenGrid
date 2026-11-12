import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Calculator,
  Download,
  FileText,
  ReceiptText,
  Sun,
} from "lucide-react";
import ExportButton from "../../components/platform/ExportButton";
import { SampleNotice } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  formatCapacity,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  downloadBillPdf,
  getBillingHistory,
  getBillingSummary,
} from "../../services/billingService";
import { getSolarCalculations } from "../../services/platformService";

export default function PersonalReportsPage() {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const hasFlat = Boolean(user?.apartment_id && user?.flat_number);
  const [downloadingId, setDownloadingId] = useState(null);

  const billing = useApiData(getBillingSummary, [], { enabled: hasFlat });
  const history = useApiData(
    () =>
      hasFlat
        ? getBillingHistory(user.flat_number)
        : Promise.resolve({ items: [] }),
    [hasFlat, user?.flat_number],
    { enabled: hasFlat }
  );
  const calculations = useApiData(() => getSolarCalculations({ limit: 50 }), []);

  const totals = billing.data?.totals || {};
  const bills = history.data?.items || [];
  const estimates = calculations.data?.items || [];

  async function handleDownload(bill) {
    if (!bill?.id) return;
    setDownloadingId(bill.id);
    try {
      await downloadBillPdf(bill.id, bill.bill_number);
      notify({
        title: "Statement downloaded",
        message: `${bill.bill_number || "Your statement"} was saved as a PDF.`,
        type: "success",
        source: "BillFair",
      });
    } catch (error) {
      notify({
        title: "Download failed",
        message: getApiErrorMessage(
          error,
          "Unable to download this statement."
        ),
        type: "error",
        source: "BillFair",
      });
    } finally {
      setDownloadingId(null);
    }
  }

  const billRows = bills.map((bill) => ({
    bill_number: bill.bill_number,
    period: bill.billing_period_label,
    period_start: bill.billing_period_start,
    period_end: bill.billing_period_end,
    version: bill.version,
    consumption_kwh: bill.consumption_kwh,
    solar_allocation_kwh: bill.solar_allocation_kwh,
    grid_import_kwh: bill.grid_import_kwh,
    solar_coverage_pct: bill.solar_coverage_percentage,
    net_payable: bill.net_payable,
    estimated_savings: bill.estimated_savings,
    status: bill.status,
    is_current: bill.is_current,
  }));

  const estimateRows = estimates.map((item) => ({
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
        icon={FileText}
        title="My savings & reports"
        description="Download every statement and rooftop estimate saved to your account. Export tables as CSV for your own records."
        actions={
          <>
            <Badge variant="success" dot>
              Personal records
            </Badge>
            {hasFlat && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  billing.reload();
                  history.reload();
                }}
                loading={billing.loading || history.loading}
              >
                Refresh
              </Button>
            )}
          </>
        }
      />

      {!hasFlat ? (
        <>
          <Card>
            <CardBody className="pt-5">
              <EmptyState
                icon={Building2}
                title="No society apartment linked"
                description="Statement reports are available once your account is linked to an apartment. Rooftop estimates you save with the calculator still appear here."
                action={
                  <Link to="/solar-calculator">
                    <Button size="sm">Open rooftop calculator</Button>
                  </Link>
                }
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Rooftop estimates"
              description="Assessments saved to your account."
              icon={Calculator}
              action={
                <ExportButton
                  rows={estimateRows}
                  filename="my-rooftop-calculations.csv"
                />
              }
            />
            <CardBody>
              {estimates.length ? (
                <EstimatesTable rows={estimates} />
              ) : (
                <p className="text-xs text-slate-500">
                  No saved rooftop estimates yet.
                </p>
              )}
            </CardBody>
          </Card>
        </>
      ) : (
        <>
          {(billing.error || history.error || calculations.error) && (
            <Card>
              <CardBody className="pt-5">
                <ErrorState
                  title="Some reports are unavailable"
                  message={
                    billing.error || history.error || calculations.error
                  }
                  onRetry={() => {
                    billing.reload();
                    history.reload();
                    calculations.reload();
                  }}
                />
              </CardBody>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Net payable (current scope)"
              value={formatCurrency(totals.net_payable)}
              detail={`${formatNumber(totals.apartment_count)} apartment(s) in scope`}
              icon={ReceiptText}
              tone="forest"
              loading={billing.loading && !billing.data}
            />
            <StatCard
              label="Estimated savings"
              value={formatCurrency(totals.estimated_savings)}
              detail={`Average ${formatCurrency(
                totals.average_estimated_savings
              )} per statement`}
              icon={Sun}
              tone="emerald"
              loading={billing.loading && !billing.data}
            />
            <StatCard
              label="Statements on record"
              value={formatNumber(bills.length)}
              detail={`${formatNumber(
                bills.filter((bill) => bill.is_current).length
              )} current versions`}
              icon={FileText}
              tone="sky"
              loading={history.loading && !history.data}
            />
            <StatCard
              label="Rooftop estimates"
              value={formatNumber(estimates.length)}
              detail="Saved calculator assessments"
              icon={Calculator}
              tone="amber"
              loading={calculations.loading && !calculations.data}
            />
          </div>

          <Card>
            <CardHeader
              title="Statement history"
              description="Every bill version for your linked apartment."
              icon={ReceiptText}
              action={
                <ExportButton
                  rows={billRows}
                  filename="my-society-bill-history.csv"
                />
              }
            />
            <CardBody className={bills.length ? "px-0 pb-0" : ""}>
              {history.loading && !history.data ? (
                <p className="px-5 pb-5 text-xs text-slate-500">
                  Loading statements…
                </p>
              ) : bills.length ? (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.08em] text-slate-400">
                        <th className="px-5 pb-2 font-semibold">Statement</th>
                        <th className="px-3 pb-2 font-semibold">Period</th>
                        <th className="px-3 pb-2 text-right font-semibold">Consumption</th>
                        <th className="px-3 pb-2 text-right font-semibold">Solar</th>
                        <th className="px-3 pb-2 text-right font-semibold">Net payable</th>
                        <th className="px-3 pb-2 text-right font-semibold">Savings</th>
                        <th className="px-3 pb-2 text-right font-semibold">Coverage</th>
                        <th className="px-5 pb-2 text-right font-semibold">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((bill) => (
                        <tr
                          key={bill.id || `${bill.bill_number}-${bill.version}`}
                          className="border-b border-slate-100 last:border-b-0"
                        >
                          <td className="px-5 py-2.5">
                            <p className="font-medium text-slate-800">
                              {bill.bill_number || "Preview"}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                              <Badge
                                variant={bill.is_current ? "success" : "neutral"}
                              >
                                v{bill.version}
                              </Badge>
                              {bill.status}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {bill.billing_period_label}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600">
                            {formatNumber(bill.consumption_kwh, 1)} kWh
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600">
                            {formatNumber(bill.solar_allocation_kwh, 1)} kWh
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                            {formatCurrency(bill.net_payable)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-700">
                            {formatCurrency(bill.estimated_savings)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600">
                            {formatPercent(bill.solar_coverage_percentage, 1)}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(bill)}
                              loading={downloadingId === bill.id}
                              disabled={!bill.id}
                            >
                              <Download size={13} />
                              PDF
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 pb-5">
                  <EmptyState
                    compact
                    icon={ReceiptText}
                    title="No statements yet"
                    description="Issued statements will appear here with a downloadable PDF."
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Rooftop estimates"
              description="Assessments saved to your account."
              icon={Calculator}
              action={
                <ExportButton
                  rows={estimateRows}
                  filename="my-rooftop-calculations.csv"
                />
              }
            />
            <CardBody>
              {estimates.length ? (
                <EstimatesTable rows={estimates} />
              ) : (
                <EmptyState
                  compact
                  icon={Calculator}
                  title="No rooftop estimates yet"
                  description="Use the rooftop calculator to save your first estimate."
                  action={
                    <Link to="/solar-calculator">
                      <Button variant="outline" size="sm">
                        Open calculator
                      </Button>
                    </Link>
                  }
                />
              )}
            </CardBody>
          </Card>

          <SampleNotice title="Report scope">
            Exports contain only the records returned for your linked apartment
            and account. Grid charges and solar credits are internal society
            estimates, not an official BESCOM bill.
          </SampleNotice>
        </>
      )}
    </div>
  );
}

function EstimatesTable({ rows }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.08em] text-slate-400">
            <th className="pb-2 font-semibold">Location</th>
            <th className="pb-2 text-right font-semibold">Capacity</th>
            <th className="pb-2 text-right font-semibold">Annual savings</th>
            <th className="pb-2 text-right font-semibold">Payback</th>
            <th className="pb-2 text-right font-semibold">Saved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
              <td className="py-2.5">
                <p className="font-medium text-slate-800">{item.location}</p>
                <p className="text-[10px] text-slate-400">{item.state}</p>
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
  );
}
