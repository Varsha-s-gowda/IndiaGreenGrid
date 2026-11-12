import { useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  Database,
  Landmark,
  RefreshCw,
  Recycle,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartCard, { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import { FreshnessBadge, StatusBadge, labelForToken } from "../../components/platform/DataBadges";
import Pagination from "../../components/platform/Pagination";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useNotifications } from "../../context/NotificationContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatDateTime, formatNumber, formatRelativeTime } from "../../lib/formatters";
import {
  getAdminOverview,
  getAdminUsers,
  getAdminActivity,
  getAdminApprovals,
  getDataSources,
  getIngestionRuns,
  getModuleUsage,
  refreshAllDataSources,
  refreshDataSource,
  updateAdminUser,
} from "../../services/platformService";

const TABS = [
  { key: "overview", label: "Overview", icon: ShieldCheck },
  { key: "users", label: "Users", icon: Users },
  { key: "approvals", label: "Approvals", icon: UserCheck },
  { key: "sources", label: "Data sources", icon: Database },
  { key: "activity", label: "Activity", icon: Activity },
];

const ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "POLICYMAKER",
];

function TabButton({ tab, active, onClick }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? "border-forest-200 bg-forest-50 text-forest-800"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <Icon size={13} />
      {tab.label}
    </button>
  );
}

function UsersPanel() {
  const { notify } = useNotifications();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("All");
  const [verification, setVerification] = useState("All");
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState(null);

  const { data, loading, error, reload } = useApiData(
    () =>
      getAdminUsers({
        search,
        role,
        verification_status: verification,
        page,
        page_size: 12,
      }),
    [search, role, verification, page]
  );

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function updateUser(user, payload) {
    setUpdatingId(user.id);
    try {
      await updateAdminUser(user.id, payload);
      notify({
        type: "success",
        title: "Account updated",
        message: `${user.email} was updated.`,
        source: "Admin portal",
      });
      reload();
    } catch (requestError) {
      notify({
        type: "error",
        title: "Update failed",
        message: getApiErrorMessage(requestError, "Unable to update the account."),
        source: "Admin portal",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="User accounts"
        description="Search accounts, change stakeholder roles and enable or disable access."
        icon={Users}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral">{formatNumber(data?.total, 0)} accounts</Badge>
            <Badge variant="warning">
              {formatNumber(data?.verification_counts?.PENDING, 0)} pending
            </Badge>
          </div>
        }
      />
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <form onSubmit={submitSearch} className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="field h-9 pl-9 text-xs"
              placeholder="Search name, email or organisation…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search users"
            />
          </form>
          <select
            className="field h-9 w-auto text-xs"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            aria-label="Filter role"
          >
            <option value="All">All roles</option>
            {(data?.roles || ROLES).map((item) => (
              <option key={item} value={item}>{labelForToken(item)}</option>
            ))}
          </select>
          <select
            className="field h-9 w-auto text-xs"
            value={verification}
            onChange={(event) => {
              setVerification(event.target.value);
              setPage(1);
            }}
            aria-label="Filter verification status"
          >
            <option value="All">All verification</option>
            {(data?.verification_statuses || ["VERIFIED", "PENDING", "REJECTED"]).map((item) => (
              <option key={item} value={item}>{labelForToken(item)}</option>
            ))}
          </select>
        </div>

        {error ? (
          <ErrorState compact title="Users unavailable" message={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (data?.items || []).length ? (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[1000px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">Account</th>
                    <th className="pb-2 font-semibold">Organisation</th>
                    <th className="pb-2 font-semibold">State</th>
                    <th className="pb-2 font-semibold">Role</th>
                    <th className="pb-2 font-semibold">Last login</th>
                    <th className="pb-2 font-semibold">Verification</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-2.5">
                        <p className="font-medium text-slate-800">{user.name}</p>
                        <p className="text-[10px] text-slate-400">{user.email}</p>
                      </td>
                      <td className="py-2.5 text-slate-600">{user.organization || "—"}</td>
                      <td className="py-2.5 text-slate-600">{user.state || "—"}</td>
                      <td className="py-2.5">
                        <select
                          className="field h-7 w-auto py-0 text-[11px]"
                          value={user.role}
                          disabled={updatingId === user.id}
                          onChange={(event) => updateUser(user, { role: event.target.value })}
                          aria-label={`Role for ${user.email}`}
                        >
                          {ROLES.map((item) => (
                            <option key={item} value={item}>{labelForToken(item)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 text-[10px] text-slate-500">
                        {user.last_login_at ? formatRelativeTime(user.last_login_at) : "Never"}
                      </td>
                      <td className="py-2.5">
                        <StatusBadge value={user.verification_status} />
                      </td>
                      <td className="py-2.5">
                        <StatusBadge value={user.is_active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          {user.verification_status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                disabled={updatingId === user.id}
                                onClick={() =>
                                  updateUser(user, {
                                    verification_status: "VERIFIED",
                                    verification_note: "Approved from the admin portal.",
                                  })
                                }
                                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === user.id}
                                onClick={() =>
                                  updateUser(user, {
                                    verification_status: "REJECTED",
                                    verification_note: "Rejected from the admin portal.",
                                  })
                                }
                                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={updatingId === user.id}
                            onClick={() => updateUser(user, { is_active: !user.is_active })}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-forest-200 hover:text-forest-700 disabled:opacity-50"
                          >
                            {user.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              onChange={setPage}
              label="accounts"
            />
          </>
        ) : (
          <p className="py-8 text-center text-xs text-slate-500">
            No accounts match the current filters.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function ApprovalsPanel() {
  const { notify } = useNotifications();
  const { data, loading, error, reload } = useApiData(getAdminApprovals, []);
  const [updatingId, setUpdatingId] = useState(null);

  async function decide(user, status) {
    setUpdatingId(user.id);
    try {
      await updateAdminUser(user.id, {
        verification_status: status,
        verification_note:
          status === "VERIFIED"
            ? "Organisation verified from the admin approvals queue."
            : "Organisation rejected from the admin approvals queue.",
      });
      notify({
        type: "success",
        title: status === "VERIFIED" ? "Organisation approved" : "Organisation rejected",
        message: `${user.email} is now ${status.toLowerCase()}.`,
        source: "Admin portal",
      });
      reload();
    } catch (requestError) {
      notify({
        type: "error",
        title: "Decision failed",
        message: getApiErrorMessage(requestError, "Unable to update this account."),
        source: "Admin portal",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Organisational approvals"
        description="DISCOM, industry, financial-institution and policymaker accounts start pending. Approve them to unlock entity-scoped writes."
        icon={UserCheck}
        action={<Badge variant="warning">{formatNumber(data?.total, 0)} pending</Badge>}
      />
      <CardBody>
        {error ? (
          <ErrorState compact title="Approvals unavailable" message={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-16 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (data?.items || []).length ? (
          <ul className="space-y-2">
            {data.items.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">{user.name}</p>
                  <p className="text-[10px] text-slate-500">{user.email}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {labelForToken(user.role)} · {user.organization || "No organisation"} ·{" "}
                    {user.state || "No state"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Registered {formatRelativeTime(user.created_at)}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <Button
                    size="sm"
                    loading={updatingId === user.id}
                    onClick={() => decide(user, "VERIFIED")}
                  >
                    <UserCheck size={13} />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={updatingId === user.id}
                    onClick={() => decide(user, "REJECTED")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-xs text-slate-500">
            No organisational accounts are awaiting verification.
          </p>
        )}
        {data?.note && (
          <p className="mt-3 text-[11px] leading-5 text-slate-500">{data.note}</p>
        )}
      </CardBody>
    </Card>
  );
}

function SourcesPanel() {
  const { notify } = useNotifications();
  const { data, loading, error, reload } = useApiData(getDataSources, []);
  const runs = useApiData(() => getIngestionRuns({ limit: 100 }), []);
  const [refreshingId, setRefreshingId] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  async function handleRefresh(source) {
    setRefreshingId(source.id);
    try {
      await refreshDataSource(source.id);
      notify({
        type: "success",
        title: "Source refreshed",
        message: `${source.name} was re-ingested.`,
        source: "Admin portal",
      });
      reload();
      runs.reload();
    } catch (requestError) {
      notify({
        type: "error",
        title: "Refresh failed",
        message: getApiErrorMessage(requestError, "Unable to refresh this source."),
        source: "Admin portal",
      });
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleRefreshAll() {
    setRefreshingAll(true);
    try {
      const result = await refreshAllDataSources();
      notify({
        type: "success",
        title: "Refresh complete",
        message: result.message,
        source: "Admin portal",
      });
      reload();
      runs.reload();
    } catch (requestError) {
      notify({
        type: "error",
        title: "Refresh failed",
        message: getApiErrorMessage(requestError, "Unable to refresh sources."),
        source: "Admin portal",
      });
    } finally {
      setRefreshingAll(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Data sources & provenance"
        description="Freshness windows, provenance and availability for every ingested dataset."
        icon={Database}
        action={
          <Button size="sm" variant="outline" onClick={handleRefreshAll} loading={refreshingAll}>
            <RefreshCw size={13} />
            Refresh all
          </Button>
        }
      />
      <CardBody>
        {error ? (
          <ErrorState compact title="Sources unavailable" message={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (data?.items || []).length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                  <th className="pb-2 font-semibold">Source</th>
                  <th className="pb-2 font-semibold">Owner</th>
                  <th className="pb-2 text-right font-semibold">Records</th>
                  <th className="pb-2 font-semibold">Freshness</th>
                  <th className="pb-2 font-semibold">Retrieved</th>
                  <th className="pb-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((source) => (
                  <tr key={source.id || source.code} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2.5">
                      <p className="font-medium text-slate-800">{source.name}</p>
                      <p className="text-[10px] text-slate-400">{source.code}</p>
                    </td>
                    <td className="py-2.5 text-slate-600">{source.organization || "—"}</td>
                    <td className="py-2.5 text-right text-slate-600">{formatNumber(source.record_count, 0)}</td>
                    <td className="py-2.5"><FreshnessBadge item={source} /></td>
                    <td className="py-2.5 text-[10px] text-slate-500">
                      {source.last_retrieved_at ? formatDateTime(source.last_retrieved_at) : "Not retrieved"}
                    </td>
                    <td className="py-2.5 text-right">
                      {source.dataset_status === "UNAVAILABLE" ? (
                        <Badge variant="danger">Not configured</Badge>
                      ) : (
                        <button
                          type="button"
                          disabled={refreshingId === source.id}
                          onClick={() => handleRefresh(source)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-forest-200 hover:text-forest-700 disabled:opacity-50"
                        >
                          {refreshingId === source.id ? "Refreshing…" : "Refresh"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-slate-500">No data sources registered.</p>
        )}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">
          Unavailable sources are never filled with fabricated data. Refresh only
          runs providers that are configured in the backend.
        </p>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-800">Ingestion attempt history</h3>
              <p className="text-[10px] text-slate-500">
                Every refresh attempt is recorded with its outcome and dataset status.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={runs.reload} loading={runs.loading}>
              <RefreshCw size={12} />
              Reload runs
            </Button>
          </div>
          {runs.error ? (
            <ErrorState compact title="Run history unavailable" message={runs.error} onRetry={runs.reload} />
          ) : runs.loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ) : (runs.data?.items || []).length ? (
            <div className="max-h-72 overflow-auto scrollbar-thin">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">Source</th>
                    <th className="pb-2 font-semibold">Outcome</th>
                    <th className="pb-2 font-semibold">Dataset</th>
                    <th className="pb-2 text-right font-semibold">Records</th>
                    <th className="pb-2 font-semibold">Trigger</th>
                    <th className="pb-2 text-right font-semibold">Started</th>
                    <th className="pb-2 text-right font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.items.map((run) => (
                    <tr key={run.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-2 text-slate-700">
                        <p className="font-medium">{run.source_code}</p>
                        <p className="text-[10px] text-slate-400">{run.message}</p>
                      </td>
                      <td className="py-2"><StatusBadge value={run.status} /></td>
                      <td className="py-2"><StatusBadge value={run.dataset_status} /></td>
                      <td className="py-2 text-right text-slate-600">{formatNumber(run.records, 0)}</td>
                      <td className="py-2 text-[10px] text-slate-500">{labelForToken(run.trigger)}</td>
                      <td className="py-2 text-right text-[10px] text-slate-500">{formatDateTime(run.started_at)}</td>
                      <td className="py-2 text-right text-[10px] text-slate-500">
                        {run.duration_ms === null || run.duration_ms === undefined ? "—" : `${formatNumber(run.duration_ms, 0)} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-slate-500">No ingestion attempts recorded yet.</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function ActivityPanel() {
  const { data, loading, error, reload } = useApiData(() => getAdminActivity({ limit: 100 }), []);

  return (
    <Card>
      <CardHeader
        title="Audit activity"
        description="Every privileged write and module action is recorded."
        icon={Activity}
        action={<Badge variant="neutral">{formatNumber(data?.total, 0)} events</Badge>}
      />
      <CardBody>
        {error ? (
          <ErrorState compact title="Activity unavailable" message={error} onRetry={reload} />
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (data?.items || []).length ? (
          <ul className="divide-y divide-slate-100">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="forest">{entry.module}</Badge>
                    <span className="text-[10px] text-slate-400">{labelForToken(entry.action)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{entry.description}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {entry.user_email || "system"} · {entry.entity_type || "—"}
                    {entry.entity_id ? ` #${entry.entity_id}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatRelativeTime(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-xs text-slate-500">No audit events yet.</p>
        )}
      </CardBody>
    </Card>
  );
}

export default function AdminPortalPage() {
  const [tab, setTab] = useState("overview");
  const overview = useApiData(getAdminOverview, []);
  const usage = useApiData(() => getModuleUsage({ days: 30 }), []);

  const data = overview.data;
  const userStats = data?.users || {};
  const content = data?.content || {};
  const community = data?.community_solar || {};
  const sourceStats = data?.data || {};

  const roleChart = useMemo(
    () =>
      Object.entries(userStats.by_role || {}).map(([role, count]) => ({
        role: labelForToken(role),
        count,
      })),
    [userStats]
  );

  const usageChart = useMemo(
    () => (usage.data?.items || []).map((item) => ({ module: labelForToken(item.module), events: item.events })),
    [usage.data]
  );

  if (overview.error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Administration" icon={ShieldCheck} title="Admin portal" />
        <ErrorState title="Admin portal unavailable" message={overview.error} onRetry={overview.reload} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        icon={ShieldCheck}
        title="Administrator portal"
        description="Manage accounts, inspect platform adoption, monitor data provenance and review the audit trail."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              overview.reload();
              usage.reload();
            }}
            loading={overview.loading || usage.loading}
          >
            <RefreshCw size={13} />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <TabButton key={item.key} tab={item} active={tab === item.key} onClick={() => setTab(item.key)} />
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total users"
              value={formatNumber(userStats.total, 0)}
              detail={`${formatNumber(userStats.active, 0)} active · ${formatNumber(userStats.pending_verification, 0)} pending verification`}
              icon={Users}
              loading={overview.loading}
            />
            <StatCard
              label="Green jobs"
              value={formatNumber(content.jobs, 0)}
              detail={`${formatNumber(content.job_applications, 0)} applications`}
              icon={BriefcaseBusiness}
              tone="sky"
              loading={overview.loading}
            />
            <StatCard
              label="Finance schemes"
              value={formatNumber(content.finance_schemes, 0)}
              detail={`${formatNumber(content.recyclers, 0)} recyclers listed`}
              icon={Landmark}
              tone="emerald"
              loading={overview.loading}
            />
            <StatCard
              label="Data sources"
              value={formatNumber(sourceStats.sources, 0)}
              detail={`${formatNumber(sourceStats.status_counts?.LIVE, 0)} live · ${formatNumber(sourceStats.status_counts?.SAMPLE, 0)} sample · ${formatNumber(sourceStats.status_counts?.UNAVAILABLE, 0)} unavailable`}
              icon={Database}
              tone="amber"
              loading={overview.loading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Community apartments"
              value={formatNumber(community.apartments, 0)}
              detail={`${formatNumber(community.simulation_runs, 0)} simulation runs`}
              icon={ShieldCheck}
              tone="slate"
              loading={overview.loading}
            />
            <StatCard
              label="Allocation runs"
              value={formatNumber(community.allocation_runs, 0)}
              detail={`${formatNumber(community.bills, 0)} bills generated`}
              icon={ShieldCheck}
              tone="slate"
              loading={overview.loading}
            />
            <StatCard
              label="Recycling transactions"
              value={formatNumber(content.recycling_transactions, 0)}
              detail={`${formatNumber(content.rpo_targets, 0)} RPO targets`}
              icon={Recycle}
              tone="slate"
              loading={overview.loading}
            />
            <StatCard
              label="Rooftop calculations"
              value={formatNumber(content.solar_calculations, 0)}
              detail={`${formatNumber(data?.activity?.total_audit_events, 0)} audit events`}
              icon={Landmark}
              tone="slate"
              loading={overview.loading}
            />
          </div>

          {(data?.alerts || []).length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((alert, index) => (
                <div
                  key={`${alert.type}-${index}`}
                  className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] leading-5 text-amber-800"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {alert.message}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Accounts by role"
              description="Stakeholder distribution across the platform."
              icon={Users}
              loading={overview.loading}
              empty={!roleChart.length}
              height="h-64"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleChart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="role" tick={{ ...AXIS_TICK, fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={54} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Accounts" fill="#2d744c" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Module usage (30 days)"
              description="Audit events grouped by module."
              icon={Activity}
              loading={usage.loading}
              error={usage.error}
              onRetry={usage.reload}
              empty={!usageChart.length}
              emptyTitle="No module events yet"
              height="h-64"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageChart} layout="vertical" margin={{ top: 4, right: 12, left: 18, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="module" tick={{ ...AXIS_TICK, fontSize: 9 }} width={92} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="events" name="Events" fill="#0ea5e9" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <Card>
            <CardHeader
              title="Recent platform activity"
              description="Latest audit events across every module."
              icon={Activity}
            />
            <CardBody>
              {(data?.activity?.recent || []).length ? (
                <ul className="divide-y divide-slate-100">
                  {data.activity.recent.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-slate-700">{entry.description}</p>
                        <p className="text-[10px] text-slate-400">
                          {entry.user_email || "system"} · {entry.module}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatRelativeTime(entry.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-xs text-slate-500">No activity recorded yet.</p>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "users" && <UsersPanel />}
      {tab === "approvals" && <ApprovalsPanel />}
      {tab === "sources" && <SourcesPanel />}
      {tab === "activity" && <ActivityPanel />}

      <p className="text-[10px] leading-5 text-slate-400">
        Platform snapshot generated {data?.generated_at ? formatDateTime(data.generated_at) : "—"}.
        Admin actions are audit-logged.
      </p>
    </div>
  );
}
