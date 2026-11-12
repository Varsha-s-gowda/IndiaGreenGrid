import { useState } from "react";
import { Link } from "react-router-dom";
import { Handshake, Package, RefreshCw, Undo2 } from "lucide-react";
import Pagination from "../../components/platform/Pagination";
import { StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import {
  ActionModal,
  NoteBanner,
  useAction,
} from "../../components/ecosystem/EcosystemKit";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { titleCaseToken } from "../../lib/constants";
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from "../../lib/formatters";
import {
  getMyQuotations,
  withdrawSupplierQuotation,
} from "../../services/ecosystemService";

const STATUS_OPTIONS = ["SUBMITTED", "SHORTLISTED", "AWARDED", "REJECTED", "WITHDRAWN"];

export default function SupplierQuotationsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isSupplier = role === "RENEWABLE_SUPPLIER";

  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [withdrawing, setWithdrawing] = useState(null);
  const action = useAction();

  const quotations = useApiData(
    () =>
      getMyQuotations({
        status: status === "All" ? undefined : status,
        page,
        pageSize: 15,
      }),
    [status, page]
  );

  const items = quotations.data?.items || [];

  async function withdraw(note) {
    await action.run("withdraw", () =>
      withdrawSupplierQuotation(withdrawing.id, note)
    );
    setWithdrawing(null);
    quotations.reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow B · quotations"
        icon={Package}
        title={isSupplier ? "My procurement quotations" : "Supplier quotations"}
        description={
          isSupplier
            ? "Track submitted offers, awards and withdrawals across DISCOM requirements."
            : "Quotations received against procurement requirements in your scope."
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={quotations.reload}
            loading={quotations.loading}
          >
            <RefreshCw size={13} /> Refresh
          </Button>
        }
      />

      {action.error && (
        <NoteBanner tone="danger" title="Action failed">
          {action.error}
        </NoteBanner>
      )}

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter quotation status"
            >
              <option value="All">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {titleCaseToken(option)}
                </option>
              ))}
            </select>
            <Badge variant="neutral">{items.length} on this page</Badge>
            <Link to="/procurement" className="ml-auto">
              <Button size="sm" variant="ghost">
                <Handshake size={13} /> Procurement marketplace
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>

      {quotations.error ? (
        <ErrorState
          title="Quotations unavailable"
          message={quotations.error}
          onRetry={quotations.reload}
        />
      ) : quotations.loading && !quotations.data ? (
        <div className="h-56 animate-pulse rounded-xl bg-white shadow-card" />
      ) : items.length ? (
        <>
          <Card>
            <CardHeader
              title="Quotation register"
              description="Only the publishing DISCOM and your organisation can see these offers."
              icon={Package}
            />
            <CardBody>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[780px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Request</th>
                      <th className="pb-2 font-semibold">Supplier</th>
                      <th className="pb-2 text-right font-semibold">Quantity</th>
                      <th className="pb-2 text-right font-semibold">Price/MWh</th>
                      <th className="pb-2 text-right font-semibold">Total</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 font-semibold">Submitted</th>
                      <th className="pb-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((quotation) => (
                      <tr
                        key={quotation.id}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-2.5 font-medium text-slate-800">
                          #{quotation.request_id}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {quotation.organisation_name ||
                            quotation.supplier_name ||
                            "Your organisation"}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(quotation.quantity_mwh, 2)} MWh
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatCurrency(quotation.price_per_mwh)}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-800">
                          {formatCurrency(quotation.total_price)}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge value={quotation.status} />
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {formatDate(quotation.created_at)}
                        </td>
                        <td className="py-2.5 text-right">
                          {isSupplier && quotation.status === "SUBMITTED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setWithdrawing(quotation)}
                            >
                              <Undo2 size={13} /> Withdraw
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={quotations.data.page}
                pages={quotations.data.pages}
                total={quotations.data.total}
                onChange={setPage}
                label="quotations"
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={Package}
          title="No quotations yet"
          description={
            isSupplier
              ? "Browse open procurement requirements and submit your first offer."
              : "Supplier offers will appear here once requirements are published."
          }
          action={
            <Link to="/procurement">
              <Button size="sm" variant="outline">
                <Handshake size={13} /> Open marketplace
              </Button>
            </Link>
          }
        />
      )}

      <ActionModal
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(null)}
        title="Withdraw quotation"
        description={
          withdrawing
            ? `Request #${withdrawing.request_id} · ${formatCurrency(
                withdrawing.total_price
              )}`
            : ""
        }
        confirmLabel="Withdraw"
        tone="danger"
        busy={action.busy === "withdraw"}
        onConfirm={withdraw}
      />
    </div>
  );
}
