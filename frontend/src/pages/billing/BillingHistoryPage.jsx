import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  FileClock,
  History,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import BillingPageHeader from "../../components/billing/BillingPageHeader";
import BillingToolbar from "../../components/billing/BillingToolbar";
import BillsTable from "../../components/billing/BillsTable";
import { useAuth } from "../../context/AuthContext";
import { useBilling } from "../../context/BillingContext";
import useApiData from "../../hooks/useApiData";
import {
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatUtcDate,
} from "../../lib/formatters";
import { getBillingHistory } from "../../services/billingService";

const PAGE_SIZE = 50;

export default function BillingHistoryPage() {
  const { isAdmin } = useAuth();
  const {
    apartments,
    apartmentsLoading,
    residentFlat,
    filters,
    summaryLoading,
    refresh,
  } = useBilling();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedFlat = searchParams.get("flat") || "";
  const [flat, setFlat] = useState(requestedFlat || residentFlat || "");
  const [offset, setOffset] = useState(0);
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

  useEffect(() => {
    setOffset(0);
  }, [flat]);

  const history = useApiData(
    () =>
      flat
        ? getBillingHistory(flat, {
            ...filters,
            limit: PAGE_SIZE,
            offset,
          })
        : Promise.resolve(null),
    [flat, filters, offset, refreshKey],
    { enabled: Boolean(flat) }
  );

  const items = history.data?.items || [];
  const total = history.data?.total || 0;
  const apartment = history.data?.apartment;

  const versionGroups = useMemo(() => {
    const groups = new Map();
    items.forEach((bill) => {
      const key = `${bill.allocation_run_id}-${bill.billing_period_start}-${bill.billing_period_end}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: bill.billing_period_label,
          start: bill.billing_period_start,
          end: bill.billing_period_end,
          method: bill.allocation_method_label,
          versions: [],
        });
      }
      groups.get(key).versions.push(bill);
    });
    return [...groups.values()];
  }, [items]);

  function selectFlat(value) {
    setFlat(value);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("flat", value);
      else next.delete("flat");
      return next;
    });
  }

  function refreshAll() {
    refresh();
    setRefreshKey((current) => current + 1);
  }

  return (
    <div className="space-y-6">
      <BillingPageHeader
        icon={History}
        title={isAdmin ? "Billing history" : "My billing history"}
        description="Every bill version stored for an apartment. Recalculations create new versions and mark earlier ones SUPERSEDED; nothing is overwritten."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="forest" dot>
              <ShieldCheck size={11} /> Versioned audit trail
            </Badge>
            <Button variant="outline" size="sm" onClick={refreshAll} loading={history.loading}>
              <RefreshCw size={13} /> Refresh
            </Button>
          </div>
        }
      />

      <BillingToolbar onRefresh={refreshAll} refreshing={summaryLoading || history.loading} />

      <Card>
        <CardBody className="flex flex-wrap items-end justify-between gap-3 pt-5">
          <label className="min-w-[18rem]">
            <span className="field-label text-xs">Apartment</span>
            {isAdmin ? (
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
            ) : (
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700">
                <Building2 size={13} className="mr-2 text-slate-400" />
                Flat {residentFlat || "not linked"}
              </div>
            )}
          </label>
          <p className="text-[11px] text-slate-500">
            {formatNumber(total)} stored version{total === 1 ? "" : "s"}
          </p>
        </CardBody>
      </Card>

      {history.error && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Billing history unavailable"
              message={history.error}
              onRetry={history.reload}
            />
          </CardBody>
        </Card>
      )}

      {!history.error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Apartment"
              value={apartment?.flat_number || flat || "—"}
              detail={
                apartment
                  ? `Floor ${apartment.floor_number} · ${apartment.apartment_category}`
                  : "Select an apartment"
              }
              icon={Building2}
              tone="forest"
              loading={history.loading && !history.data}
            />
            <StatCard
              label="Billing periods"
              value={formatNumber(versionGroups.length)}
              detail="Distinct issued periods for this flat"
              icon={CalendarDays}
              tone="sky"
              loading={history.loading && !history.data}
            />
            <StatCard
              label="Latest version"
              value={
                items.length
                  ? `v${Math.max(...items.map((bill) => bill.version || 0))}`
                  : "—"
              }
              detail={
                items[0]?.generated_at
                  ? formatDateTime(items[0].generated_at)
                  : "No statements stored"
              }
              icon={FileClock}
              tone="emerald"
              loading={history.loading && !history.data}
            />
          </div>

          <Card>
            <CardHeader
              title="Stored versions"
              description="Newest first. Current ISSUED bills are the payable statements; SUPERSEDED versions are retained for traceability."
              icon={History}
              action={<Badge variant="neutral">{formatNumber(total)} rows</Badge>}
            />
            <CardBody className="space-y-4 pt-1">
              {history.loading && !history.data ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
                </div>
              ) : !items.length ? (
                <EmptyState
                  icon={FileClock}
                  title="No billing history for this apartment"
                  description={
                    isAdmin
                      ? "Issue bills for the selected allocation run to start a version history."
                      : "Your statements will appear here once the administrator issues them."
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
                        onClick={() =>
                          setOffset((current) => Math.max(0, current - PAGE_SIZE))
                        }
                        disabled={offset === 0 || history.loading}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOffset((current) => current + PAGE_SIZE)}
                        disabled={offset + PAGE_SIZE >= total || history.loading}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          {versionGroups.length > 0 && (
            <Card>
              <CardHeader
                title="Period timeline"
                description="Each period shows every stored version and its energy totals."
                icon={CalendarDays}
              />
              <CardBody className="space-y-3 pt-1">
                {versionGroups.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          {group.label}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatUtcDate(group.start)} – {formatUtcDate(group.end)} ·{" "}
                          {group.method}
                        </p>
                      </div>
                      <Badge variant="info">
                        {group.versions.length} version
                        {group.versions.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600">
                      {group.versions.map((bill) => (
                        <span key={bill.id} className="inline-flex items-center gap-1.5">
                          <Badge
                            variant={
                              bill.status === "ISSUED"
                                ? "success"
                                : bill.status === "SUPERSEDED"
                                  ? "neutral"
                                  : "danger"
                            }
                          >
                            v{bill.version} {bill.status}
                          </Badge>
                          {formatEnergy(bill.consumption_kwh, 2)} consumed ·{" "}
                          {formatEnergy(bill.solar_allocation_kwh, 2)} solar
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
