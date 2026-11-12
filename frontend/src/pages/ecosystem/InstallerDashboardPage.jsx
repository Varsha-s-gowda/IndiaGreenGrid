import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Inbox,
  RefreshCw,
  Wrench,
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
import { formatCapacity, formatDate, formatNumber } from "../../lib/formatters";
import { getDashboardOverview } from "../../services/platformService";
import {
  getMyOrganisation,
  getSolarInstallations,
  getSolarRequests,
} from "../../services/ecosystemService";

export default function InstallerDashboardPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);
  const profile = useApiData(getMyOrganisation, []);
  const requests = useApiData(() => getSolarRequests({ pageSize: 8 }), []);
  const installations = useApiData(
    () => getSolarInstallations({ completed: false, pageSize: 8 }),
    []
  );

  const organisation = profile.data;
  const ecosystem = overview.data?.ecosystem || {};
  const requestItems = requests.data?.items || [];
  const installItems = installations.data?.items || [];

  function refresh() {
    overview.reload();
    profile.reload();
    requests.reload();
    installations.reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Solar installer workspace"
        icon={Wrench}
        title={`Welcome, ${user?.name?.split(" ")[0] || "installer"}`}
        description="Manage rooftop requests, submit quotations and keep installation progress current."
        actions={
          <>
            <Badge variant={organisation?.verification_status === "VERIFIED" ? "success" : "warning"} dot>
              {organisation?.verification_status || "Profile pending"}
            </Badge>
            <Button variant="outline" size="sm" onClick={refresh} loading={overview.loading}>
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {organisation && organisation.verification_status !== "VERIFIED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="text-[11px] leading-5 text-amber-900">
            <p className="font-semibold">Verification required before you can quote</p>
            <p>
              Complete your organisation profile and upload registration evidence. An
              administrator must approve the business before requests can be accepted.
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
          title="Installer dashboard unavailable"
          message={overview.error}
          onRetry={refresh}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Requests in scope"
              value={formatNumber(ecosystem.solar_requests, 0)}
              detail="Open and assigned"
              icon={Inbox}
              tone="forest"
              loading={overview.loading}
            />
            <StatCard
              label="Active installations"
              value={formatNumber(installItems.length, 0)}
              detail="Started or on hold"
              icon={Wrench}
              tone="sky"
              loading={installations.loading}
            />
            <StatCard
              label="Unread notifications"
              value={formatNumber(ecosystem.unread_notifications, 0)}
              detail="Workflow updates"
              icon={Bell}
              tone="amber"
              loading={overview.loading}
            />
            <StatCard
              label="Organisation"
              value={
                organisation?.verification_status === "VERIFIED"
                  ? "Verified"
                  : organisation?.verification_status || "—"
              }
              detail={organisation?.name || "Complete your profile"}
              icon={CheckCircle2}
              tone="emerald"
              loading={profile.loading}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Request inbox"
                description="New requests in your serviceable states and jobs assigned to you."
                icon={ClipboardList}
                action={
                  <Link
                    to="/solar-requests"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    Open inbox <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                {requests.error ? (
                  <ErrorState
                    compact
                    title="Requests unavailable"
                    message={requests.error}
                    onRetry={requests.reload}
                  />
                ) : requestItems.length ? (
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                          <th className="pb-2 font-semibold">Project</th>
                          <th className="pb-2 font-semibold">Location</th>
                          <th className="pb-2 font-semibold">Capacity</th>
                          <th className="pb-2 font-semibold">Status</th>
                          <th className="pb-2 font-semibold">Received</th>
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
                                {item.project_title}
                              </p>
                              <p className="text-[10px] text-slate-400">{item.reference}</p>
                            </td>
                            <td className="py-2.5 text-slate-600">
                              {item.city}, {item.state}
                            </td>
                            <td className="py-2.5 text-slate-600">
                              {formatCapacity(item.desired_capacity_kwp)}
                            </td>
                            <td className="py-2.5">
                              <StatusBadge value={item.status} />
                            </td>
                            <td className="py-2.5 text-slate-500">
                              {formatDate(item.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={Inbox}
                    title="No requests in scope"
                    description="New requirements in your serviceable states will appear here."
                    action={
                      <Link to="/solar-requests">
                        <Button size="sm" variant="outline">
                          Open request inbox
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
                title="Active installations"
                description="Progress updates are visible to the requesting citizen."
                icon={Wrench}
                action={
                  <Link
                    to="/solar-installations"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
                  >
                    View all <ArrowRight size={12} />
                  </Link>
                }
              />
              <CardBody>
                {installItems.length ? (
                  <ul className="space-y-3">
                    {installItems.map((installation) => (
                      <li
                        key={installation.id}
                        className="rounded-lg border border-slate-200 px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              Request #{installation.request_id}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {installation.installer_name || "Your business"}
                            </p>
                          </div>
                          <StatusBadge value={installation.status} />
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-forest-600"
                            style={{ width: `${installation.progress_pct || 0}%` }}
                          />
                        </div>
                        <p className="mt-1 text-right text-[10px] text-slate-500">
                          {installation.progress_pct || 0}% complete
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    No active installations. Accepted quotations become installations
                    automatically.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Business profile"
                description="Verification status and service coverage."
                icon={Building2}
              />
              <CardBody className="space-y-2">
                {[
                  ["Business", organisation?.name || "—"],
                  ["City", organisation?.city || "—"],
                  ["State", organisation?.state || "—"],
                  [
                    "Serviceable states",
                    (organisation?.serviceable_states || []).join(", ") || "State-wide",
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
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
