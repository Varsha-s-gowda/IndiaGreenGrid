import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Handshake,
  Package,
  RefreshCw,
  Send,
  Trophy,
} from "lucide-react";
import { NotificationsSummaryCard } from "../../components/ecosystem/NotificationFeed";
import { StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { titleCaseToken } from "../../lib/constants";
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from "../../lib/formatters";
import { getDashboardOverview } from "../../services/platformService";
import {
  getMyOrganisation,
  getMyQuotations,
  getProcurementRequests,
} from "../../services/ecosystemService";

export default function SupplierDashboardPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);
  const profile = useApiData(getMyOrganisation, []);
  const requests = useApiData(
    () => getProcurementRequests({ pageSize: 8 }),
    []
  );
  const quotations = useApiData(
    () => getMyQuotations({ pageSize: 50 }),
    []
  );

  const organisation = profile.data;
  const ecosystem = overview.data?.ecosystem || {};
  const requestItems = requests.data?.items || [];
  const quoteItems = quotations.data?.items || [];
  const openQuotes = quoteItems.filter((quote) => quote.status === "SUBMITTED");
  const awardedQuotes = quoteItems.filter((quote) => quote.status === "AWARDED");

  function refresh() {
    overview.reload();
    profile.reload();
    requests.reload();
    quotations.reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Renewable supplier workspace"
        icon={Handshake}
        title={`Welcome, ${user?.name?.split(" ")[0] || "supplier"}`}
        description="Track open power requirements, submit quotations and monitor awarded contracts."
        actions={
          <>
            <Badge
              variant={
                organisation?.verification_status === "VERIFIED"
                  ? "success"
                  : "warning"
              }
              dot
            >
              {organisation?.verification_status || "Profile pending"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              loading={overview.loading}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {organisation && organisation.verification_status !== "VERIFIED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="text-[11px] leading-5 text-amber-900">
            <p className="font-semibold">Verification required before quoting</p>
            <p>
              Complete your organisation profile, serviceable states and energy
              types. Only verified suppliers can submit procurement quotations.
            </p>
          </div>
          <Link to="/organisation">
            <Button size="sm" variant="outline">
              <Building2 size={13} /> Complete profile
            </Button>
          </Link>
        </div>
      )}

      {overview.error ? (
        <ErrorState
          title="Supplier dashboard unavailable"
          message={overview.error}
          onRetry={refresh}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Requests in scope"
              value={formatNumber(requests.data?.total, 0)}
              detail="Open requirements"
              icon={Handshake}
              tone="forest"
              loading={requests.loading}
            />
            <StatCard
              label="Submitted quotations"
              value={formatNumber(openQuotes.length, 0)}
              detail="Awaiting DISCOM decision"
              icon={Send}
              tone="sky"
              loading={quotations.loading}
            />
            <StatCard
              label="Awarded contracts"
              value={formatNumber(awardedQuotes.length, 0)}
              detail="Won through the marketplace"
              icon={Trophy}
              tone="emerald"
              loading={quotations.loading}
            />
            <StatCard
              label="Unread notifications"
              value={formatNumber(ecosystem.unread_notifications, 0)}
              detail="Workflow updates"
              icon={Bell}
              tone="amber"
              loading={overview.loading}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Open requirements"
                description="Requirements matching your serviceable states and energy types."
                icon={Handshake}
                action={
                  <Link
                    to="/procurement"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Open marketplace <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                {requests.error ? (
                  <ErrorState
                    compact
                    title="Requirements unavailable"
                    message={requests.error}
                    onRetry={requests.reload}
                  />
                ) : requestItems.length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                          <th className="pb-2 font-semibold">Requirement</th>
                          <th className="pb-2 font-semibold">Type</th>
                          <th className="pb-2 text-right font-semibold">Quantity</th>
                          <th className="pb-2 text-right font-semibold">Ceiling</th>
                          <th className="pb-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requestItems.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-100 last:border-b-0"
                          >
                            <td className="py-2.5">
                              <p className="font-medium text-slate-800">
                                {item.title}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {item.reference} · {item.delivery_location || "State-wide"}
                              </p>
                            </td>
                            <td className="py-2.5 text-slate-600">
                              {titleCaseToken(item.energy_type)}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatNumber(item.quantity_mwh, 1)} MWh
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {item.max_price_per_mwh
                                ? formatCurrency(item.max_price_per_mwh)
                                : "Open"}
                            </td>
                            <td className="py-2.5">
                              <StatusBadge value={item.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={Handshake}
                    title="No open requirements"
                    description="New DISCOM requirements in your serviceable states will appear here."
                    action={
                      <Link to="/procurement">
                        <Button size="sm" variant="outline">
                          Browse marketplace
                        </Button>
                      </Link>
                    }
                  />
                )}
              </CardBody>
            </Card>

            <NotificationsSummaryCard limit={5} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent quotations"
                description="Prices and award status for your active offers."
                icon={Package}
                action={
                  <Link
                    to="/procurement/quotations"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    View all <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                {quoteItems.length ? (
                  <ul className="space-y-3">
                    {quoteItems.slice(0, 5).map((quotation) => (
                      <li
                        key={quotation.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3.5 py-3"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            Request #{quotation.request_id} ·{" "}
                            {formatCurrency(quotation.total_price)}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatNumber(quotation.quantity_mwh, 2)} MWh at{" "}
                            {formatCurrency(quotation.price_per_mwh)}/MWh ·{" "}
                            {formatDate(quotation.created_at)}
                          </p>
                        </div>
                        <StatusBadge value={quotation.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    No quotations submitted yet.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Business profile"
                description="Verification and supply coverage."
                icon={Building2}
              />
              <CardBody className="space-y-2">
                {[
                  ["Business", organisation?.name || "—"],
                  ["GSTIN", organisation?.gstin || "—"],
                  ["State", organisation?.state || "—"],
                  [
                    "Serviceable states",
                    (organisation?.serviceable_states || []).join(", ") || "State-wide",
                  ],
                  [
                    "Energy types",
                    (organisation?.energy_types || []).join(", ") || "All types",
                  ],
                  ["Documents", formatNumber(organisation?.document_count, 0)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-slate-100 py-2 last:border-b-0"
                  >
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="max-w-[60%] text-right text-xs font-semibold text-slate-800">
                      {value}
                    </span>
                  </div>
                ))}
                <Link to="/organisation">
                  <Button variant="outline" size="sm" className="mt-2 w-full">
                    <Building2 size={13} /> Manage profile
                  </Button>
                </Link>
                {organisation?.verification_status === "VERIFIED" && (
                  <p className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                    <CheckCircle2 size={11} /> Verified supplier
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
