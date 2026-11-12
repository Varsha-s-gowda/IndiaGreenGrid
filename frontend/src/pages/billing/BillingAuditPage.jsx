import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import Toggle from "../../components/ui/Toggle";
import BillingPageHeader from "../../components/billing/BillingPageHeader";
import { useNotifications } from "../../context/NotificationContext";
import { useBilling } from "../../context/BillingContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatSignedCurrency,
  formatUtcDate,
} from "../../lib/formatters";
import {
  getBillingAudits,
  reviewBillingAudit,
  runBillingAudit,
} from "../../services/billingService";

const CHECK_TYPES = [
  "BILL_RECALCULATION",
  "CONSUMPTION",
  "SOLAR_ALLOCATION",
  "GRID_IMPORT",
  "TARIFF",
  "GRID_CHARGE",
  "SOLAR_CREDIT",
  "MAINTENANCE",
  "OTHER_CHARGES",
  "NET_PAYABLE",
  "SAVINGS",
  "LINE_ITEMS",
  "MISSING_BILL",
  "DUPLICATE_BILL",
];

const CHECK_LABELS = Object.fromEntries(
  CHECK_TYPES.map((type) => [type, type.replaceAll("_", " ").toLowerCase()])
);

const STATUS_VARIANTS = {
  PASS: "success",
  WARNING: "warning",
  FAIL: "danger",
  REVIEWED: "info",
};

const PAGE_SIZE = 100;

export default function BillingAuditPage() {
  const { notify } = useNotifications();
  const { runOptions, selectedRunId, selectRun, month, selectMonth } = useBilling();

  const [includePassed, setIncludePassed] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [batchResult, setBatchResult] = useState(null);

  const [batchFilter, setBatchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [checkFilter, setCheckFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const audits = useApiData(
    () =>
      getBillingAudits({
        audit_batch_id: batchFilter.trim() || undefined,
        status: statusFilter || undefined,
        check_type: checkFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [batchFilter, statusFilter, checkFilter, offset, refreshKey]
  );

  const items = audits.data?.items || [];
  const total = audits.data?.total || 0;
  const counts = audits.data?.status_counts || {};

  const reviewTarget = useReviewState();

  const latest = useMemo(() => {
    if (batchResult) return batchResult;
    return null;
  }, [batchResult]);

  async function handleRunAudit() {
    setRunning(true);
    setRunError("");
    try {
      const result = await runBillingAudit({
        allocation_run_id: selectedRunId || undefined,
        billing_month: month || undefined,
        include_passed: includePassed,
      });
      setBatchResult(result);
      setBatchFilter(result.audit_batch_id);
      setOffset(0);
      setRefreshKey((current) => current + 1);
      notify({
        title: result.failed ? "Audit found discrepancies" : "Audit passed",
        message: `${result.bills_audited} bill(s) audited · ${result.passed} passed · ${result.failed} failed · ${result.missing_bills} missing · ${result.duplicate_bills} duplicate.`,
        type: result.failed || result.missing_bills ? "warning" : "success",
        source: "BillFair",
      });
    } catch (requestError) {
      setRunError(getApiErrorMessage(requestError, "Unable to run the audit."));
    } finally {
      setRunning(false);
    }
  }

  async function handleReview(note) {
    if (!reviewTarget.target) return;
    reviewTarget.setSaving(true);
    try {
      await reviewBillingAudit(reviewTarget.target.id, { note: note || undefined });
      notify({
        title: "Finding reviewed",
        message: "The audit finding was marked reviewed. The issued bill was not modified.",
        type: "success",
        source: "BillFair",
      });
      reviewTarget.close();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      notify({
        title: "Review failed",
        message: getApiErrorMessage(requestError, "Unable to review this finding."),
        type: "error",
        source: "BillFair",
      });
    } finally {
      reviewTarget.setSaving(false);
    }
  }

  function applyFilters({ status, check, batch }) {
    if (status !== undefined) setStatusFilter(status);
    if (check !== undefined) setCheckFilter(check);
    if (batch !== undefined) setBatchFilter(batch);
    setOffset(0);
  }

  return (
    <div className="space-y-6">
      <BillingPageHeader
        icon={ShieldCheck}
        title="Independent billing audit"
        description="Recalculates every issued bill from stored consumption, allocation, tariff and rule records using a separate audit engine. Audits never auto-modify an issued statement."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="forest" dot>
              Administrator only
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((current) => current + 1)}
              loading={audits.loading}
            >
              <RefreshCw size={13} /> Refresh findings
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Run an audit"
          description="Select the saved allocation run and optional billing month. Missing and duplicate detection covers the whole period."
          icon={ClipboardCheck}
        />
        <CardBody className="space-y-4 pt-1">
          <div className="grid gap-4 md:grid-cols-3">
            <label>
              <span className="field-label text-xs">Allocation run</span>
              <select
                className="field h-10 text-xs"
                value={selectedRunId || ""}
                onChange={(event) =>
                  selectRun(event.target.value ? Number(event.target.value) : null)
                }
                disabled={!runOptions.length}
              >
                {!runOptions.length && <option value="">No saved run</option>}
                {runOptions.map((run) => (
                  <option key={run.id} value={run.id}>
                    Run #{run.id} · {run.method_label} · {run.date_from} to {run.date_to}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label text-xs">Billing month (optional)</span>
              <input
                type="month"
                className="field h-10 text-xs"
                value={month}
                onChange={(event) => selectMonth(event.target.value)}
              />
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <Toggle
                checked={includePassed}
                onChange={setIncludePassed}
                label="Show passed checks"
                description="Include PASS rows in the response and stored findings."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Button onClick={handleRunAudit} loading={running} disabled={!selectedRunId}>
              <ShieldAlert size={14} /> Run independent audit
            </Button>
            <span className="text-[11px] text-slate-500">
              The audit recalculates from PostgreSQL. It does not trust stored bill amounts.
            </span>
          </div>

          {runError && (
            <ErrorState compact title="Audit failed" message={runError} />
          )}
        </CardBody>
      </Card>

      {latest && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                latest.failed || latest.missing_bills || latest.duplicate_bills
                  ? "warning"
                  : "success"
              }
              dot
            >
              {latest.audit_batch_id}
            </Badge>
            <span className="text-[11px] text-slate-500">
              {formatUtcDate(latest.billing_period_start)} –{" "}
              {formatUtcDate(latest.billing_period_end)} ·{" "}
              {formatDateTime(latest.created_at)}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Bills audited"
              value={formatNumber(latest.bills_audited)}
              detail={`${formatNumber(latest.issues_found)} issue(s) found`}
              icon={ClipboardCheck}
              tone="forest"
            />
            <StatCard
              label="Passed"
              value={formatNumber(latest.passed)}
              detail="Recalculation matches the issued bill"
              icon={CheckCircle2}
              tone="emerald"
            />
            <StatCard
              label="Failed"
              value={formatNumber(latest.failed)}
              detail={`${formatNumber(latest.missing_bills)} missing · ${formatNumber(latest.duplicate_bills)} duplicate`}
              icon={XCircle}
              tone="rose"
            />
            <StatCard
              label="Checks per bill"
              value="Energy + money"
              detail="Consumption, allocation, tariff, credits, charges, savings"
              icon={ShieldCheck}
              tone="sky"
            />
          </div>

          <div
            className={`rounded-xl border px-4 py-3 text-[11px] leading-5 ${
              latest.failed || latest.missing_bills || latest.duplicate_bills
                ? "border-amber-200 bg-amber-50/70 text-amber-900"
                : "border-emerald-200 bg-emerald-50/70 text-emerald-900"
            }`}
          >
            <p className="inline-flex items-center gap-2 font-semibold">
              {latest.failed || latest.missing_bills || latest.duplicate_bills ? (
                <AlertTriangle size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {latest.message}
            </p>
            <p className="mt-1">
              Audits are advisory. Issued bills remain immutable and are never repaired
              automatically; use an intentional recalculation to create a corrected version.
            </p>
          </div>
        </>
      )}

      <Card>
        <CardHeader
          title="Stored findings"
          description="Every audit run is persisted with its batch id, check type, expected and calculated amounts."
          icon={Filter}
          action={<Badge variant="neutral">{formatNumber(total)} rows</Badge>}
        />
        <CardBody className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="field-label text-xs">Batch id</span>
              <input
                className="field h-9 font-mono text-[11px]"
                value={batchFilter}
                onChange={(event) => applyFilters({ batch: event.target.value })}
                placeholder="BA-…"
                maxLength={40}
              />
            </label>
            <label>
              <span className="field-label text-xs">Status</span>
              <select
                className="field h-9 text-xs"
                value={statusFilter}
                onChange={(event) => applyFilters({ status: event.target.value })}
              >
                <option value="">All statuses</option>
                <option value="PASS">Pass</option>
                <option value="FAIL">Fail</option>
                <option value="WARNING">Warning</option>
                <option value="REVIEWED">Reviewed</option>
              </select>
            </label>
            <label>
              <span className="field-label text-xs">Check type</span>
              <select
                className="field h-9 text-xs"
                value={checkFilter}
                onChange={(event) => applyFilters({ check: event.target.value })}
              >
                <option value="">All checks</option>
                {CHECK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CHECK_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyFilters({ batch: "", status: "", check: "" })}
              >
                Clear filters
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).map(([status, count]) => (
              <Badge key={status} variant={STATUS_VARIANTS[status] || "neutral"} dot>
                {status} {formatNumber(count)}
              </Badge>
            ))}
          </div>

          {audits.error && (
            <ErrorState
              compact
              title="Findings unavailable"
              message={audits.error}
              onRetry={audits.reload}
            />
          )}

          {audits.loading && !audits.data ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState
              icon={ShieldCheck}
              title="No audit findings yet"
              description="Run an audit above to recalculate issued bills and persist findings."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2.5 pr-3 font-medium">Flat / bill</th>
                      <th className="py-2.5 pr-3 font-medium">Check</th>
                      <th className="py-2.5 pr-3 text-right font-medium">Expected</th>
                      <th className="py-2.5 pr-3 text-right font-medium">Calculated</th>
                      <th className="py-2.5 pr-3 text-right font-medium">Discrepancy</th>
                      <th className="py-2.5 pr-3 font-medium">Status</th>
                      <th className="py-2.5 pr-3 font-medium">Explanation</th>
                      <th className="py-2.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((finding) => (
                      <tr key={finding.id} className="align-top hover:bg-slate-50/60">
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-slate-800">
                            {finding.flat_number || `Apartment #${finding.apartment_id ?? "—"}`}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {finding.bill_number || finding.bill_id || "missing bill"}
                          </p>
                          <p className="font-mono text-[9px] text-slate-400">
                            {finding.audit_batch_id}
                          </p>
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {CHECK_LABELS[finding.check_type] || finding.check_type}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-600">
                          {finding.expected_amount == null
                            ? "—"
                            : formatCurrency(finding.expected_amount)}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-600">
                          {finding.calculated_amount == null
                            ? "—"
                            : formatCurrency(finding.calculated_amount)}
                        </td>
                        <td
                          className={`py-3 pr-3 text-right font-medium ${
                            Number(finding.discrepancy) === 0
                              ? "text-slate-500"
                              : "text-rose-700"
                          }`}
                        >
                          {finding.discrepancy == null
                            ? "—"
                            : formatSignedCurrency(finding.discrepancy)}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge
                            variant={STATUS_VARIANTS[finding.status] || "neutral"}
                            dot
                          >
                            {finding.status}
                          </Badge>
                        </td>
                        <td className="max-w-[22rem] py-3 pr-3 text-[11px] leading-5 text-slate-600">
                          {finding.explanation}
                          {finding.review_note && (
                            <p className="mt-1 text-[10px] text-sky-700">
                              Review note: {finding.review_note}
                            </p>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {finding.status === "FAIL" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => reviewTarget.open(finding)}
                            >
                              Review
                            </Button>
                          ) : finding.status === "REVIEWED" ? (
                            <span className="text-[10px] text-slate-400">
                              {formatDateTime(finding.reviewed_at)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
                    disabled={offset === 0 || audits.loading}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((current) => current + PAGE_SIZE)}
                    disabled={offset + PAGE_SIZE >= total || audits.loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <ReviewDialog state={reviewTarget} onSubmit={handleReview} />
    </div>
  );
}

function useReviewState() {
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  function open(finding) {
    setTarget(finding);
    setNote("");
  }

  function close() {
    if (saving) return;
    setTarget(null);
    setNote("");
  }

  return { target, open, close, saving, setSaving, note, setNote };
}

function ReviewDialog({ state, onSubmit }) {
  const { target, close, saving, note, setNote } = state;
  if (!target) return null;
  return (
    <ConfirmDialog
      open={Boolean(target)}
      title="Mark finding reviewed"
      description={
        `Record a review note for ${target.flat_number || "this finding"} (${CHECK_LABELS[target.check_type] || target.check_type}). ` +
        "Reviewing does not alter the issued bill or hide the discrepancy."
      }
      confirmLabel="Mark reviewed"
      cancelLabel="Cancel"
      loading={saving}
      onConfirm={() => onSubmit(note)}
      onCancel={close}
    >
      <label className="mt-4 block text-left">
        <span className="field-label text-xs">Review note</span>
        <textarea
          className="field min-h-[80px] text-xs"
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Explain the resolution, escalation or accepted explanation."
        />
      </label>
      {saving && (
        <p className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500">
          <Loader2 size={12} className="animate-spin" /> Saving review…
        </p>
      )}
    </ConfirmDialog>
  );
}
