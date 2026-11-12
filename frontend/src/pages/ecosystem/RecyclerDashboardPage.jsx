import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Bell,
  Building2,
  CheckCircle2,
  Package,
  Recycle,
  RefreshCw,
  Truck,
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
import { formatDate, formatNumber } from "../../lib/formatters";
import { getDashboardOverview } from "../../services/platformService";
import {
  getMyOrganisation,
  getRecyclingAnalytics,
  getRecyclingRequests,
} from "../../services/ecosystemService";

export default function RecyclerDashboardPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);
  const profile = useApiData(getMyOrganisation, []);
  const analytics = useApiData(getRecyclingAnalytics, []);
  const requests = useApiData(
    () => getRecyclingRequests({ pageSize: 8 }),
    []
  );

  const organisation = profile.data;
  const ecosystem = overview.data?.ecosystem || {};
  const requestItems = requests.data?.items || [];
  const stats = analytics.data || {};

  function refresh() {
    overview.reload();
    profile.reload();
    analytics.reload();
    requests.reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recycling facility workspace"
        icon={Recycle}
        title={`Welcome, ${user?.name?.split(" ")[0] || "recycler"}`}
        description="Manage pickup queues, record material recovery and issue recycling certificates."
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
            <p className="font-semibold">Verification required before accepting pickups</p>
            <p>
              Add your accepted waste categories and serviceable states. Only verified
              facilities receive matching pickup requests.
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
          title="Recycler dashboard unavailable"
          message={overview.error}
          onRetry={refresh}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Assigned pickups"
              value={formatNumber(stats.requests, 0)}
              detail="Across all statuses"
              icon={Truck}
              tone="forest"
              loading={analytics.loading}
            />
            <StatCard
              label="Completed"
              value={formatNumber(stats.completed, 0)}
              detail="Certified processing"
              icon={CheckCircle2}
              tone="emerald"
              loading={analytics.loading}
            />
            <StatCard
              label="Recovered material"
              value={`${formatNumber(stats.recovered_material_kg, 1)} kg`}
              detail="Recorded recovery"
              icon={Package}
              tone="sky"
              loading={analytics.loading}
            />
            <StatCard
              label="Unread notifications"
              value={formatNumber(ecosystem.unread_notifications, 0)}
              detail="New pickup requests"
              icon={Bell}
              tone="amber"
              loading={overview.loading}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Pickup queue"
                description="Requests assigned to your facility and open requests in your service area."
                icon={Truck}
                action={
                  <Link
                    to="/recycling-requests"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Open queue <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                {requests.error ? (
                  <ErrorState
                    compact
                    title="Pickups unavailable"
                    message={requests.error}
                    onRetry={requests.reload}
                  />
                ) : requestItems.length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                          <th className="pb-2 font-semibold">Reference</th>
                          <th className="pb-2 font-semibold">Material</th>
                          <th className="pb-2 font-semibold">Location</th>
                          <th className="pb-2 text-right font-semibold">Weight</th>
                          <th className="pb-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requestItems.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-100 last:border-b-0"
                          >
                            <td className="py-2.5 font-medium text-slate-800">
                              {item.reference}
                            </td>
                            <td className="py-2.5 text-slate-600">
                              {titleCaseToken(item.waste_category)}
                            </td>
                            <td className="py-2.5 text-slate-600">
                              {item.city}, {item.state}
                            </td>
                            <td className="py-2.5 text-right text-slate-600">
                              {formatNumber(item.estimated_weight_kg, 1)} kg
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
                    icon={Recycle}
                    title="No pickup requests"
                    description="New requests matching your accepted categories will appear here."
                    action={
                      <Link to="/recycling-requests">
                        <Button size="sm" variant="outline">
                          Open pickup queue
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
                title="Recovery by category"
                description="Totals from completed and active pickups assigned to your facility."
                icon={Package}
              />
              <CardBody>
                {stats.by_category && Object.keys(stats.by_category).length ? (
                  <div className="space-y-3">
                    {Object.entries(stats.by_category).map(([key, bucket]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-slate-700">
                            {titleCaseToken(key)}
                          </span>
                          <span className="text-slate-500">
                            {formatNumber(bucket.collected_kg, 1)} kg collected ·{" "}
                            {formatNumber(bucket.requests, 0)} requests
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-forest-600"
                            style={{
                              width: `${Math.min(
                                bucket.estimated_kg
                                  ? (bucket.collected_kg / bucket.estimated_kg) * 100
                                  : 0,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Recovery totals appear once pickups are accepted and collected.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Facility profile"
                description="Accepted categories and service coverage."
                icon={Building2}
              />
              <CardBody className="space-y-2">
                {[
                  ["Facility", organisation?.name || "—"],
                  ["City", organisation?.city || "—"],
                  ["State", organisation?.state || "—"],
                  [
                    "Serviceable states",
                    (organisation?.serviceable_states || []).join(", ") || "State-wide",
                  ],
                  [
                    "Accepted categories",
                    (organisation?.accepted_categories || []).join(", ") || "All approved",
                  ],
                  ["Certificates", formatNumber(stats.certificates, 0)],
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
                {stats.certificates > 0 && (
                  <p className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                    <Award size={11} /> {formatNumber(stats.certificates, 0)} recycling
                    certificates issued
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
