import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileText,
  Fingerprint,
  Layers,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import BillingDisclaimer from "../../components/billing/BillingDisclaimer";
import BillingPageHeader from "../../components/billing/BillingPageHeader";
import BillingToolbar from "../../components/billing/BillingToolbar";
import BillBreakdown from "../../components/billing/BillBreakdown";
import BillStatusBadge from "../../components/billing/BillStatusBadge";
import BillsTable from "../../components/billing/BillsTable";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useBilling } from "../../context/BillingContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  formatDateTime,
  formatNumber,
  formatUtcDate,
} from "../../lib/formatters";
import { downloadBillPdf, getBill, getBillingFlats } from "../../services/billingService";

const PAGE_SIZE = 50;

export default function BillDetailsPage() {
  const { billId } = useParams();
  if (billId) return <SingleBillView billId={billId} />;
  return <BillRegisterView />;
}

function SingleBillView({ billId }) {
  const { notify } = useNotifications();
  const { disclaimer } = useBilling();
  const [downloading, setDownloading] = useState(false);
  const bill = useApiData(() => getBill(billId), [billId]);

  async function handleDownload() {
    if (!bill.data) return;
    setDownloading(true);
    try {
      await downloadBillPdf(bill.data.id, bill.data.bill_number);
    } catch (error) {
      notify({
        title: "PDF download failed",
        message: getApiErrorMessage(error, "Unable to download this statement."),
        type: "error",
        source: "BillFair",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <BillingPageHeader
        icon={FileText}
        title="Bill details"
        description="The complete issued statement: energy, tariff segments, internal solar credit, maintenance and estimated savings."
        actions={
          <Link to="/billing/bills">
            <Button variant="outline" size="sm">
              <ArrowLeft size={13} /> All bills
            </Button>
          </Link>
        }
      />

      {bill.loading && !bill.data && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {bill.error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState title="Bill unavailable" message={bill.error} onRetry={bill.reload} />
          </CardBody>
        </Card>
      )}

      {bill.data && (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-start justify-between gap-4 pt-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-forest-700">
                  {bill.data.bill_number || "Preview bill"}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  Flat {bill.data.apartment?.flat_number || bill.data.apartment_id} ·{" "}
                  {bill.data.billing_period_label}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {formatUtcDate(bill.data.billing_period_start)} –{" "}
                  {formatUtcDate(bill.data.billing_period_end)} ·{" "}
                  {bill.data.allocation_method_label}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <BillStatusBadge
                    status={bill.data.status}
                    isCurrent={bill.data.is_current}
                  />
                  <Badge variant="neutral">Version {bill.data.version}</Badge>
                  {bill.data.latest_audit && (
                    <Badge
                      variant={
                        bill.data.latest_audit.status === "PASS"
                          ? "success"
                          : bill.data.latest_audit.status === "FAIL"
                            ? "danger"
                            : "warning"
                      }
                      dot
                    >
                      Audit {bill.data.latest_audit.status}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleDownload} loading={downloading}>
                  <Download size={14} /> Download PDF
                </Button>
                <Link to={`/billing/history?flat=${encodeURIComponent(
                  bill.data.apartment?.flat_number || ""
                )}`}>
                  <Button variant="outline" size="md">
                    <ReceiptText size={14} /> History
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <BillBreakdown bill={bill.data} />
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader
                  title="Who and when"
                  description="Statement identity and provenance."
                  icon={UserRound}
                />
                <CardBody className="space-y-0 pt-1">
                  <DetailRow label="Apartment">
                    {bill.data.apartment?.flat_number || "—"} · Floor{" "}
                    {bill.data.apartment?.floor_number ?? "—"}
                  </DetailRow>
                  <DetailRow label="Resident">
                    {bill.data.resident
                      ? `${bill.data.resident.name} (${bill.data.resident.email})`
                      : "No linked resident"}
                  </DetailRow>
                  <DetailRow label="Issued at">
                    {formatDateTime(bill.data.issued_at || bill.data.generated_at)}
                  </DetailRow>
                  <DetailRow label="Generated by">
                    {bill.data.generated_by
                      ? bill.data.generated_by.name
                      : "—"}
                  </DetailRow>
                  <DetailRow label="Allocation run">
                    #{bill.data.allocation_run_id} · {bill.data.allocation_method}
                  </DetailRow>
                  <DetailRow label="Simulation run">
                    #{bill.data.simulation_run_id}
                  </DetailRow>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Audit identity"
                  description="Stored hashes allow independent re-verification."
                  icon={Fingerprint}
                />
                <CardBody className="space-y-0 pt-1">
                  <DetailRow label="Algorithm">
                    {bill.data.algorithm_version}
                  </DetailRow>
                  <DetailRow label="Input hash">
                    <span className="break-all font-mono text-[10px]">
                      {bill.data.input_hash}
                    </span>
                  </DetailRow>
                  <DetailRow label="Hours aggregated">
                    {formatNumber(bill.data.hour_count)}
                  </DetailRow>
                  <DetailRow label="Billing config">
                    #{bill.data.billing_configuration_id ?? "—"}
                  </DetailRow>
                  <DetailRow label="Tariff segments">
                    {formatNumber(bill.data.tariff_snapshot?.length || 0)}
                  </DetailRow>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Supercession chain"
                  description="Issued bills are never mutated in place."
                  icon={Layers}
                />
                <CardBody className="space-y-2 pt-1 text-xs text-slate-600">
                  {bill.data.supersedes_bill_id ? (
                    <p>
                      This version supersedes bill{" "}
                      <Link
                        to={`/billing/bills/${bill.data.supersedes_bill_id}`}
                        className="font-medium text-forest-700 hover:text-forest-900"
                      >
                        #{bill.data.supersedes_bill_id}
                      </Link>
                      .
                    </p>
                  ) : (
                    <p className="flex items-start gap-2">
                      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                      This is the first recorded version for the apartment and period.
                    </p>
                  )}
                  {bill.data.notes && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                      {bill.data.notes}
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          <BillingDisclaimer text={disclaimer} />
        </>
      )}
    </div>
  );
}

function BillRegisterView() {
  const { isAdmin } = useAuth();
  const { summary, summaryLoading, filters, disclaimer } = useBilling();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const result = useApiData(
    () =>
      getBillingFlats({
        ...filters,
        status: status || undefined,
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [filters, status, search, offset]
  );

  const items = result.data?.items || [];
  const total = result.data?.total || 0;

  return (
    <div className="space-y-6">
      <BillingPageHeader
        icon={FileText}
        title={isAdmin ? "Bill details" : "My statements"}
        description="Open any statement to inspect the full calculation, audit identity and PDF download."
        actions={
          <Badge variant="info" dot>
            <Layers size={11} /> Issued snapshots
          </Badge>
        }
      />

      <BillingToolbar onRefresh={result.reload} refreshing={summaryLoading || result.loading} />

      <Card>
        <CardHeader
          title="Statements"
          description="Search by flat or status. Preview rows are only available in the generation workspace."
          icon={CalendarDays}
          action={<Badge variant="neutral">{formatNumber(total)} matching</Badge>}
        />
        <CardBody className="space-y-4 pt-1">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[16rem] flex-1">
              <span className="field-label text-xs">Search flat</span>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="field h-9 pl-9 text-xs"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setOffset(0);
                  }}
                  placeholder="e.g. A-101"
                  maxLength={40}
                />
              </div>
            </label>
            <label>
              <span className="field-label text-xs">Status</span>
              <select
                className="field h-9 w-44 text-xs"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All statuses</option>
                <option value="ISSUED">Issued</option>
                <option value="SUPERSEDED">Superseded</option>
                <option value="VOID">Void</option>
              </select>
            </label>
          </div>

          {result.error && (
            <ErrorState
              compact
              title="Bills unavailable"
              message={result.error}
              onRetry={result.reload}
            />
          )}

          {result.loading && !result.data ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState
              icon={FileText}
              title="No statements found"
              description="Issue bills from the generation workspace or change the selected period."
            />
          ) : (
            <>
              <BillsTable bills={items} />
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <span className="text-[11px] text-slate-500">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{" "}
                  {formatNumber(total)}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                    disabled={offset === 0 || result.loading}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((current) => current + PAGE_SIZE)}
                    disabled={offset + PAGE_SIZE >= total || result.loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <BillingDisclaimer text={disclaimer} />
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 text-xs last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}
