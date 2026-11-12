import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  Download,
  Gauge,
  IndianRupee,
  ReceiptText,
  RefreshCw,
  Search,
  Sun,
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
import BillingToolbar from "../../components/billing/BillingToolbar";
import BillsTable from "../../components/billing/BillsTable";
import { useAuth } from "../../context/AuthContext";
import { useBilling } from "../../context/BillingContext";
import useApiData from "../../hooks/useApiData";
import {
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import { getBillingFlats } from "../../services/billingService";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "ISSUED", label: "Issued" },
  { value: "SUPERSEDED", label: "Superseded" },
  { value: "VOID", label: "Void" },
];

export default function ApartmentBillsPage() {
  const { isAdmin, user } = useAuth();
  const { summary, summaryLoading, filters, refresh, disclaimer } = useBilling();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const result = useApiData(
    () =>
      getBillingFlats({
        ...filters,
        status: status || undefined,
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [filters, status, search, offset, refreshKey]
  );

  const items = result.data?.items || [];
  const total = result.data?.total || 0;
  const totals = summary?.totals;

  const scopeLabel = useMemo(() => {
    if (isAdmin) return "All apartments";
    return user?.flat_number ? `Flat ${user.flat_number}` : "Your apartment";
  }, [isAdmin, user?.flat_number]);

  function refreshAll() {
    refresh();
    setRefreshKey((current) => current + 1);
  }

  function changeSearch(value) {
    setSearch(value);
    setOffset(0);
  }

  function changeStatus(value) {
    setStatus(value);
    setOffset(0);
  }

  return (
    <div className="space-y-6">
      <BillingPageHeader
        icon={Building2}
        title={isAdmin ? "Apartment-wise bills" : "My apartment bills"}
        description={
          isAdmin
            ? "Every issued statement in the selected period, with consumption, solar allocation, grid import, internal credit and estimated savings."
            : "Statements for the apartment linked to your resident account. You cannot view any other flat."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" dot>
              {scopeLabel}
            </Badge>
            <Button variant="outline" size="sm" onClick={refreshAll} loading={result.loading}>
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        }
      />

      <BillingToolbar onRefresh={refreshAll} refreshing={summaryLoading || result.loading} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Statements"
          value={formatNumber(total || summary?.bills_generated)}
          detail={`${formatNumber(summary?.apartments_billed)} apartments billed`}
          icon={ReceiptText}
          tone="forest"
          loading={summaryLoading}
        />
        <StatCard
          label="Net payable"
          value={formatCurrency(totals?.net_payable)}
          detail={`${formatCurrency(totals?.average_net_payable)} average`}
          icon={IndianRupee}
          tone="sky"
          loading={summaryLoading}
        />
        <StatCard
          label="Solar allocation"
          value={formatEnergy(totals?.solar_allocation_kwh, 2)}
          detail={`${formatCurrency(totals?.solar_credit)} internal credit`}
          icon={Sun}
          tone="emerald"
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

      <Card>
        <CardHeader
          title="Bill register"
          description="Issued bills are immutable snapshots. Superseded versions remain visible for history but are not current."
          icon={CalendarDays}
          action={
            <Badge variant="neutral">
              {formatNumber(total)} matching
            </Badge>
          }
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
                  onChange={(event) => changeSearch(event.target.value)}
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
                onChange={(event) => changeStatus(event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {!isAdmin && (
              <Link to="/billing/portal">
                <Button variant="secondary" size="sm">
                  <Download size={13} /> Open resident portal
                </Button>
              </Link>
            )}
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
              icon={ReceiptText}
              title="No bills match these filters"
              description={
                isAdmin
                  ? "Try another period, clear the search, or issue bills from Generate bills."
                  : "Your statement will appear once the administrator issues it for this period."
              }
              action={
                isAdmin ? (
                  <Link to="/billing/generate">
                    <Button size="sm">Generate bills</Button>
                  </Link>
                ) : null
              }
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
