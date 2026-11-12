import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Building2,
  Download,
  FileText,
  History,
  Info,
  Leaf,
  ReceiptText,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import BillingDisclaimer from "../../components/billing/BillingDisclaimer";
import BillingPageHeader from "../../components/billing/BillingPageHeader";
import BillBreakdown from "../../components/billing/BillBreakdown";
import BillStatusBadge from "../../components/billing/BillStatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useBilling } from "../../context/BillingContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  formatCurrency,
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { downloadBillPdf, getFlatBilling } from "../../services/billingService";

export default function ResidentPortalPage() {
  const { isAdmin } = useAuth();
  const { notify } = useNotifications();
  const {
    apartments,
    apartmentsLoading,
    residentFlat,
    filters,
    config,
    disclaimer,
    summary,
  } = useBilling();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFlat = searchParams.get("flat") || "";
  const [flat, setFlat] = useState(requestedFlat || residentFlat || "");
  const [downloading, setDownloading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      setFlat(residentFlat || "");
      return;
    }
    if (requestedFlat) {
      setFlat(requestedFlat);
      return;
    }
    if (!flat && apartments.length) {
      setFlat(apartments[0].flat_number);
    }
  }, [isAdmin, residentFlat, requestedFlat, apartments, flat]);

  const detail = useApiData(
    () =>
      flat
        ? getFlatBilling(flat, { ...filters })
        : Promise.resolve(null),
    [flat, filters, refreshKey],
    { enabled: Boolean(flat) }
  );

  const bill = detail.data?.bill || null;
  const apartment = detail.data?.apartment || null;
  const resident = detail.data?.resident || null;
  const historyCount = detail.data?.history_count || 0;

  function selectFlat(value) {
    setFlat(value);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("flat", value);
      else next.delete("flat");
      return next;
    });
  }

  async function handleDownload() {
    if (!bill?.id) return;
    setDownloading(true);
    try {
      await downloadBillPdf(bill.id, bill.bill_number);
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
        icon={UserRound}
        title={isAdmin ? "Resident portal preview" : "My solar bill"}
        description={
          isAdmin
            ? "See exactly what a resident sees for their apartment: the current statement, savings explanation and PDF statement."
            : "Your current society statement, internal solar credit and estimated savings for the selected billing period."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isAdmin ? "info" : "success"} dot>
              <ShieldCheck size={11} />
              {isAdmin ? "Admin preview" : "Resident scoped"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((current) => current + 1)}
              loading={detail.loading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Apartment"
          value={apartment?.flat_number || flat || "—"}
          detail={
            apartment
              ? `Floor ${apartment.floor_number} · ${apartment.apartment_category}`
              : "No apartment selected"
          }
          icon={Building2}
          tone="forest"
          loading={detail.loading && !detail.data}
        />
        <StatCard
          label="Current period"
          value={bill?.billing_period_label || "—"}
          detail={
            bill
              ? `${formatUtcDate(bill.billing_period_start)} – ${formatUtcDate(bill.billing_period_end)}`
              : "No issued statement"
          }
          icon={ReceiptText}
          tone="sky"
          loading={detail.loading && !detail.data}
        />
        <StatCard
          label="Net payable"
          value={formatCurrency(bill?.net_payable)}
          detail="Grid charge − solar credit + maintenance"
          icon={ReceiptText}
          tone="emerald"
          loading={detail.loading && !detail.data}
        />
        <StatCard
          label="Estimated savings"
          value={formatCurrency(bill?.estimated_savings)}
          detail={
            bill
              ? `${formatPercent(bill.solar_coverage_percentage, 2)} of consumption covered by solar`
              : "No statement"
          }
          icon={Sun}
          tone="amber"
          loading={detail.loading && !detail.data}
        />
      </div>

      {isAdmin && (
        <Card>
          <CardBody className="flex flex-wrap items-end justify-between gap-3 pt-5">
            <label className="min-w-[18rem]">
              <span className="field-label text-xs">Preview apartment</span>
              <select
                className="field h-9 text-xs"
                value={flat}
                onChange={(event) => selectFlat(event.target.value)}
                disabled={apartmentsLoading || !apartments.length}
              >
                {!apartments.length && <option value="">No apartments</option>}
                {apartments.map((item) => (
                  <option key={item.id} value={item.flat_number}>
                    {item.flat_number} · {item.apartment_category}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] text-slate-500">
              Admins can preview any flat. Residents can only load the flat linked to
              their account.
            </p>
          </CardBody>
        </Card>
      )}

      {detail.error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Statement unavailable"
              message={detail.error}
              onRetry={detail.reload}
            />
          </CardBody>
        </Card>
      )}

      {detail.loading && !detail.data && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {!detail.loading && !detail.error && !bill && (
        <Card>
          <CardBody className="pt-5">
            <EmptyState
              icon={ReceiptText}
              title="No statement for this period"
              description={
                isAdmin
                  ? "No issued bill exists for this apartment in the selected period. Generate or select another period."
                  : "Your monthly statement has not been issued yet. Please check back after the administrator generates bills."
              }
              action={
                isAdmin ? (
                  <Link to="/billing/generate">
                    <Button size="sm">Generate bills</Button>
                  </Link>
                ) : null
              }
            />
          </CardBody>
        </Card>
      )}

      {bill && (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-start justify-between gap-4 pt-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-forest-700">
                  BillFair statement
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {bill.bill_number}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {apartment?.flat_number || flat} · {bill.billing_period_label} ·{" "}
                  {bill.allocation_method_label}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {resident
                    ? `Resident: ${resident.name}`
                    : "No resident account linked to this flat"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <BillStatusBadge status={bill.status} isCurrent={bill.is_current} />
                  <Badge variant="neutral">Version {bill.version}</Badge>
                  {bill.latest_audit && (
                    <Badge
                      variant={
                        bill.latest_audit.status === "PASS"
                          ? "success"
                          : bill.latest_audit.status === "FAIL"
                            ? "danger"
                            : "warning"
                      }
                      dot
                    >
                      Audit {bill.latest_audit.status}
                    </Badge>
                  )}
                  <Badge variant="info">
                    Generated {formatDateTime(bill.generated_at)}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleDownload} loading={downloading}>
                  <Download size={14} /> Download PDF statement
                </Button>
                <Link
                  to={`/billing/history?flat=${encodeURIComponent(
                    apartment?.flat_number || flat
                  )}`}
                >
                  <Button variant="outline" size="md">
                    <History size={14} /> View history ({formatNumber(historyCount)})
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <BillBreakdown bill={bill} title="My statement breakdown" />
            </div>

            <div className="min-w-0 space-y-5">
              <Card>
                <CardHeader
                  title="What you pay"
                  description="The payable amount for this period."
                  icon={ReceiptText}
                />
                <CardBody className="space-y-3 pt-1">
                  <MoneyRow label="Grid charge" value={formatCurrency(bill.grid_charge)} />
                  <MoneyRow
                    label="Internal solar credit"
                    value={`− ${formatCurrency(bill.solar_credit)}`}
                    tone="credit"
                  />
                  <MoneyRow
                    label="Maintenance"
                    value={formatCurrency(bill.maintenance_charge)}
                  />
                  <MoneyRow
                    label="Other charges"
                    value={formatCurrency(bill.other_charges)}
                  />
                  <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-3">
                    <span className="text-xs font-semibold text-slate-700">
                      Net payable
                    </span>
                    <span className="text-lg font-bold text-forest-800">
                      {formatCurrency(bill.net_payable)}
                    </span>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Your solar benefit"
                  description="Internal society benefit, separate from BESCOM."
                  icon={Leaf}
                />
                <CardBody className="space-y-3 pt-1 text-xs">
                  <MoneyRow
                    label="Consumption"
                    value={formatEnergy(bill.consumption_kwh, 2)}
                  />
                  <MoneyRow
                    label="Solar allocated"
                    value={formatEnergy(bill.solar_allocation_kwh, 2)}
                  />
                  <MoneyRow
                    label="Grid import"
                    value={formatEnergy(bill.grid_import_kwh, 2)}
                  />
                  <MoneyRow
                    label="Solar coverage"
                    value={formatPercent(bill.solar_coverage_percentage, 2)}
                  />
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                    <p className="text-[11px] text-emerald-800">Estimated savings</p>
                    <p className="mt-1 text-base font-semibold text-emerald-900">
                      {formatCurrency(bill.estimated_savings)}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-emerald-800">
                      No-solar baseline {formatCurrency(bill.no_solar_baseline_cost)} −
                      actual estimated cost {formatCurrency(bill.actual_estimated_cost)}.
                    </p>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Society rules"
                  description="Applied to this statement from PostgreSQL."
                  icon={Info}
                />
                <CardBody className="space-y-2 pt-1 text-xs text-slate-600">
                  <MoneyRow
                    label="Solar credit rate"
                    value={`${formatCurrency(bill.solar_credit_rate_per_kwh)}/kWh`}
                  />
                  <MoneyRow
                    label="Effective tariff"
                    value={`${formatCurrency(bill.tariff_price_per_kwh)}/kWh`}
                  />
                  <MoneyRow
                    label="Maintenance"
                    value={`${formatCurrency(config.latest?.maintenance_charge)}/month`}
                  />
                  <MoneyRow
                    label="Allocation"
                    value={bill.allocation_method_label}
                  />
                  <MoneyRow
                    label="Hours aggregated"
                    value={formatNumber(bill.hour_count)}
                  />
                  <p className="pt-1 text-[10px] leading-4 text-slate-500">
                    Tariff and credit revisions are applied per calendar day; the full
                    segment table is in the breakdown above.
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}

      <Card>
        <CardHeader
          title="How your bill is calculated"
          description="Plain-language version of the documented formulas."
          icon={FileText}
        />
        <CardBody className="grid gap-3 pt-1 sm:grid-cols-2">
          <Formula
            title="Grid import"
            formula="Consumption − solar allocation"
            note="Only electricity not covered by your allocated solar is purchased from the grid."
          />
          <Formula
            title="Grid charge"
            formula="Grid import × applicable tariff"
            note="Tariff revisions are applied to each calendar day of the period."
          />
          <Formula
            title="Solar credit"
            formula="Allocated solar × credit rate"
            note="An internal society credit. It is not a BESCOM rebate or export payment."
          />
          <Formula
            title="Net payable"
            formula="Grid charge − solar credit + maintenance + other"
            note="The amount on your society statement for this period."
          />
          <Formula
            title="Estimated savings"
            formula="No-solar baseline − actual estimated cost"
            note="Measures avoided grid electricity at the applicable tariff, independent of the internal credit rate."
          />
          <Formula
            title="Official BESCOM"
            formula="Separate from this statement"
            note="Your BESCOM bill is issued by BESCOM. This statement is the society's internal solar accounting."
          />
        </CardBody>
      </Card>

      <BillingDisclaimer text={disclaimer || summary?.disclaimer} />
    </div>
  );
}

function MoneyRow({ label, value, tone = "default" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span
        className={`text-right font-semibold ${
          tone === "credit" ? "text-emerald-700" : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Formula({ title, formula, note }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
      <p className="text-xs font-semibold text-slate-800">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-forest-800">{formula}</p>
      <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{note}</p>
    </div>
  );
}
