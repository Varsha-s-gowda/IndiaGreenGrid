import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  PlayCircle,
  ReceiptText,
  RotateCcw,
  Save,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import ErrorState from "../../components/ui/ErrorState";
import StatCard from "../../components/ui/StatCard";
import Toggle from "../../components/ui/Toggle";
import BillingPageHeader from "../../components/billing/BillingPageHeader";
import BillsTable from "../../components/billing/BillsTable";
import { useNotifications } from "../../context/NotificationContext";
import { useBilling } from "../../context/BillingContext";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { generateBills } from "../../services/billingService";

export default function GenerateBillsPage() {
  const { notify } = useNotifications();
  const { runOptions, selectedRunId, selectRun, apartments, refresh } = useBilling();

  const [mode, setMode] = useState("run");
  const [month, setMonth] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const [recalculate, setRecalculate] = useState(false);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedRun = useMemo(
    () => runOptions.find((run) => run.id === selectedRunId) || null,
    [runOptions, selectedRunId]
  );

  function buildPayload({ save, recalculate: recalc }) {
    return {
      allocation_run_id: selectedRunId || undefined,
      ...(mode === "month" && month ? { billing_month: month } : {}),
      ...(flatNumber ? { flat_number: flatNumber } : {}),
      save,
      recalculate: save ? recalc : false,
      allow_incomplete: allowIncomplete,
      notes: notes.trim() || undefined,
    };
  }

  async function handlePreview() {
    setPreviewing(true);
    setError("");
    setResult(null);
    try {
      const data = await generateBills(buildPayload({ save: false }));
      setPreview(data);
      notify({
        title: "Preview ready",
        message: `${data.apartments_generated} statement(s) calculated. Nothing has been saved.`,
        type: "info",
        source: "BillFair",
      });
    } catch (requestError) {
      setPreview(null);
      setError(getApiErrorMessage(requestError, "Unable to preview bills."));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleIssue() {
    setSaving(true);
    setError("");
    try {
      const data = await generateBills(
        buildPayload({ save: true, recalculate })
      );
      setResult(data);
      setConfirmOpen(false);
      await refresh();
      notify({
        title: data.duplicate ? "Bills already issued" : "Bills issued",
        message: data.duplicate
          ? `${data.duplicate_count} identical bill(s) already existed. No duplicate rows were created.`
          : `${data.apartments_generated} bill(s) issued. ${data.superseded_count} prior version(s) preserved as superseded.`,
        type: data.duplicate ? "info" : "success",
        source: "BillFair",
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to issue bills."));
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const active = result?.saved ? result : preview;

  return (
    <div className="space-y-6">
      <BillingPageHeader
        icon={PlayCircle}
        title="Generate monthly bills"
        description="Preview real calculations from the saved allocation run, then issue immutable statements. Preview never writes to PostgreSQL; issued bills are preserved as versions."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="forest" dot>
              <Lock size={11} />
              Administrator only
            </Badge>
            <Link to="/billing/audit">
              <Button variant="outline" size="sm">
                Run audit
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Billing inputs"
          description="Select the saved allocation run, period and scope. All energy comes from stored allocation records."
          icon={ReceiptText}
        />
        <CardBody className="space-y-5 pt-1">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <span className="field-label text-xs">Period mode</span>
              <select
                className="field h-10 text-xs"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="run">Full allocation run period</option>
                <option value="month">Specific calendar month</option>
              </select>
            </label>

            <label>
              <span className="field-label text-xs">Billing month</span>
              <input
                type="month"
                className="field h-10 text-xs disabled:bg-slate-50"
                value={month}
                min={selectedRun?.date_from}
                max={selectedRun?.date_to}
                onChange={(event) => setMonth(event.target.value)}
                disabled={mode !== "month"}
              />
            </label>

            <label>
              <span className="field-label text-xs">Apartment scope</span>
              <select
                className="field h-10 text-xs"
                value={flatNumber}
                onChange={(event) => setFlatNumber(event.target.value)}
              >
                <option value="">All apartments</option>
                {apartments.map((apartment) => (
                  <option key={apartment.id} value={apartment.flat_number}>
                    {apartment.flat_number} · {apartment.apartment_category}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <Toggle
                checked={allowIncomplete}
                onChange={setAllowIncomplete}
                label="Allow incomplete allocation records"
                description="When enabled, missing hours are not fabricated; affected statements are flagged in the warnings."
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <Toggle
                checked={recalculate}
                onChange={setRecalculate}
                label="Intentional recalculation"
                description="On issue, supersede current bills and create a new version. Prior issued statements are never overwritten."
              />
            </div>
          </div>

          <label>
            <span className="field-label text-xs">Notes (optional)</span>
            <textarea
              className="field min-h-[72px] text-xs"
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Document the billing rationale for this issuance."
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Button onClick={handlePreview} loading={previewing} disabled={!selectedRunId || (mode === "month" && !month)}>
              <RotateCcw size={14} />
              Preview bills
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(true)}
              disabled={!selectedRunId || (mode === "month" && !month)}
            >
              <Save size={14} />
              Issue bills
            </Button>
            {selectedRun && (
              <span className="text-[11px] text-slate-500">
                Run period {formatUtcDate(selectedRun.date_from)} –{" "}
                {formatUtcDate(selectedRun.date_to)} · {selectedRun.method_label}
              </span>
            )}
          </div>

          {error && (
            <ErrorState
              compact
              title="Billing request failed"
              message={error}
            />
          )}
        </CardBody>
      </Card>

      {active && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={active.saved ? "success" : "info"} dot>
              {active.saved ? "ISSUED" : "PREVIEW ONLY"}
            </Badge>
            {active.duplicate && (
              <Badge variant="warning">Duplicates detected</Badge>
            )}
            {active.recalculated && (
              <Badge variant="forest">Recalculated · new version</Badge>
            )}
            <span className="text-[11px] text-slate-500">
              {active.billing_period.label} ·{" "}
              {formatUtcDate(active.billing_period.start)} –{" "}
              {formatUtcDate(active.billing_period.end)} ·{" "}
              {active.billing_period.days} days
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Statements"
              value={formatNumber(active.apartments_generated)}
              detail={`${formatNumber(active.apartments_requested)} requested`}
              icon={ReceiptText}
              tone="forest"
            />
            <StatCard
              label="Net payable"
              value={formatCurrency(active.totals.net_payable)}
              detail={`${formatCurrency(active.totals.average_net_payable)} average`}
              icon={ReceiptText}
              tone="sky"
            />
            <StatCard
              label="Solar credit"
              value={formatCurrency(active.totals.solar_credit)}
              detail={`${formatEnergy(active.totals.solar_allocation_kwh, 2)} allocated`}
              icon={ReceiptText}
              tone="emerald"
            />
            <StatCard
              label="Estimated savings"
              value={formatCurrency(active.totals.estimated_savings)}
              detail={`${formatPercent(active.totals.solar_coverage_percentage, 2)} solar coverage`}
              icon={ReceiptText}
              tone="amber"
            />
          </div>

          {active.warnings?.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold text-amber-900">
                <AlertTriangle size={14} />
                Calculation warnings
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-amber-900">
                {active.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {active.usage_report && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-600 shadow-card">
              <span className="inline-flex items-center gap-1.5">
                <Info size={12} />
                Expected hours {formatNumber(active.usage_report.expected_hours)}
              </span>
              <span>
                Apartments available {formatNumber(active.usage_report.apartments_available)} /{" "}
                {formatNumber(active.usage_report.apartments_total)}
              </span>
              <span>
                Incomplete apartments {formatNumber(active.usage_report.incomplete_count)}
              </span>
              <span>
                Tariff revisions {formatNumber(active.tariff_revisions?.length || 0)} ·
                Rule revisions {formatNumber(active.billing_configurations?.length || 0)}
              </span>
            </div>
          )}

          {active.saved && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-[11px] leading-5 text-emerald-900">
              <p className="inline-flex items-center gap-2 font-semibold">
                <CheckCircle2 size={14} />
                Issued bills are immutable snapshots.
              </p>
              <p className="mt-1">
                New rows {formatNumber(active.apartments_generated)} · duplicates{" "}
                {formatNumber(active.duplicate_count)} · superseded prior versions{" "}
                {formatNumber(active.superseded_count)}. Run an independent audit from the
                Billing audit page.
              </p>
            </div>
          )}

          <Card>
            <CardHeader
              title={active.saved ? "Issued statements" : "Preview statements"}
              description="Charge breakdown, solar allocation and estimated savings for every apartment."
              icon={ReceiptText}
              action={
                active.saved ? (
                  <Link to="/billing/apartments">
                    <Button variant="outline" size="sm">
                      Open apartment bills
                    </Button>
                  </Link>
                ) : null
              }
            />
            <CardBody className="pt-1">
              <BillsTable bills={active.bills} showPeriod={false} />
            </CardBody>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={recalculate ? "Issue recalculation?" : "Issue bills?"}
        description={
          recalculate
            ? "Current bills for this run and period will be marked SUPERSEDED and preserved. New ISSUED versions will be created. This cannot silently overwrite prior statements."
            : "Bills will be saved as ISSUED snapshots. Identical existing bills are returned as duplicates instead of being duplicated. If inputs differ, the API will reject the request unless you enable intentional recalculation."
        }
        confirmLabel={recalculate ? "Issue new versions" : "Issue bills"}
        tone={recalculate ? "secondary" : "primary"}
        loading={saving}
        onConfirm={handleIssue}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
