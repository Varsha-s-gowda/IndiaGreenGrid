import { useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  HandCoins,
  Handshake,
  Recycle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Users,
  Layers,
} from "lucide-react";
import Modal from "../../components/platform/Modal";
import Pagination from "../../components/platform/Pagination";
import { StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import {
  ActionModal,
  DetailGrid,
  DocumentPanel,
  NoteBanner,
  ProvenanceNote,
  Timeline,
  useAction,
} from "../../components/ecosystem/EcosystemKit";
import useApiData from "../../hooks/useApiData";
import { titleCaseToken } from "../../lib/constants";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRole,
} from "../../lib/formatters";
import {
  getOrganisation,
  getOrganisations,
  getPlatformOverview,
  getPolicyAggregates,
  reviewOrganisation,
} from "../../services/ecosystemService";

const TABS = [
  { key: "monitoring", label: "Monitoring", icon: Activity },
  { key: "organisations", label: "Organisations", icon: Building2 },
  { key: "policy", label: "Policy signals", icon: ClipboardCheck },
];

const ORGANISATION_TYPES = [
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "SOLAR_INSTALLER",
  "RENEWABLE_SUPPLIER",
  "RECYCLER",
];

const VERIFICATION_STATUSES = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "SUSPENDED",
  "DOCUMENTS_REQUESTED",
];

const REVIEW_ACTIONS = [
  {
    action: "APPROVE",
    label: "Approve",
    tone: "primary",
    requireNote: false,
  },
  {
    action: "REQUEST_DOCUMENTS",
    label: "Request documents",
    tone: "primary",
    requireNote: true,
  },
  {
    action: "REJECT",
    label: "Reject",
    tone: "danger",
    requireNote: true,
  },
  {
    action: "SUSPEND",
    label: "Suspend",
    tone: "danger",
    requireNote: true,
  },
  {
    action: "REACTIVATE",
    label: "Reactivate",
    tone: "primary",
    requireNote: true,
  },
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

function MonitoringPanel({ overview, onRefresh }) {
  if (overview.error) {
    return (
      <ErrorState
        title="Platform monitoring unavailable"
        message={overview.error}
        onRetry={onRefresh}
      />
    );
  }

  const data = overview.data || {};
  const breakdown = data.organisation_breakdown || {};

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered users"
          value={formatNumber(data.total_users, 0)}
          detail={`${formatNumber(data.active_users, 0)} active accounts`}
          icon={Users}
          tone="forest"
          loading={overview.loading}
        />
        <StatCard
          label="Verified organisations"
          value={formatNumber(data.verified_organisations, 0)}
          detail={`${formatNumber(data.pending_registrations, 0)} awaiting verification`}
          icon={BadgeCheck}
          tone="emerald"
          loading={overview.loading}
        />
        <StatCard
          label="Solar installations"
          value={formatNumber(data.completed_installations, 0)}
          detail={`${formatNumber(data.registered_capacity_kwp, 2)} kWp registered`}
          icon={Sun}
          tone="amber"
          loading={overview.loading}
        />
        <StatCard
          label="Waste processed"
          value={`${formatNumber(data.waste_processed_kg, 1)} kg`}
          detail={`${formatNumber(data.active_recycling_requests, 0)} active pickups`}
          icon={Recycle}
          tone="sky"
          loading={overview.loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Solar requests"
          value={formatNumber(data.solar_requests, 0)}
          detail="Citizen ↔ installer workflow"
          icon={Sun}
          tone="forest"
          loading={overview.loading}
        />
        <StatCard
          label="Open procurement"
          value={formatNumber(data.open_procurement_requests, 0)}
          detail={`${formatNumber(data.procurement_requests, 0)} total requirements`}
          icon={Handshake}
          tone="sky"
          loading={overview.loading}
        />
        <StatCard
          label="Pending loan applications"
          value={formatNumber(data.pending_loan_applications, 0)}
          detail={`${formatNumber(data.active_loan_products, 0)} active products`}
          icon={HandCoins}
          tone="emerald"
          loading={overview.loading}
        />
        <StatCard
          label="Pending compliance"
          value={formatNumber(data.pending_compliance, 0)}
          detail="Filings awaiting verification"
          icon={ClipboardCheck}
          tone="amber"
          loading={overview.loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Organisation coverage"
            description="Registrations by stakeholder type on the platform."
            icon={Building2}
            action={<Badge variant="neutral">{ORGANISATION_TYPES.length} types</Badge>}
          />
          <CardBody>
            <div className="space-y-3">
              {ORGANISATION_TYPES.map((type) => {
                const count = breakdown[type] || 0;
                const max = Math.max(
                  ...[ORGANISATION_TYPES.map((key) => breakdown[key] || 0), 1]
                );
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700">
                        {formatRole(type)}
                      </span>
                      <span className="text-slate-500">
                        {formatNumber(count, 0)} organisation
                        {count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-forest-600"
                        style={{ width: `${Math.round((count / max) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Monitoring provenance"
            description="Live counts computed from workflow tables."
            icon={ShieldCheck}
          />
          <CardBody className="space-y-3">
            <ProvenanceNote
              block={{
                label: "Platform monitoring",
                provenance: {
                  classification: "PLATFORM_RECORDED",
                  note: data.note,
                },
              }}
            />
            <div className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
              <span className="text-slate-500">Generated</span>
              <span className="font-semibold text-slate-800">
                {data.generated_at ? formatDateTime(data.generated_at) : "—"}
              </span>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={onRefresh}>
              <RefreshCw size={13} /> Refresh monitoring
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function OrganisationDetail({ organisationId, onClose, onChanged }) {
  const { data: organisation, loading, error, reload } = useApiData(
    () => getOrganisation(organisationId),
    [organisationId],
    { enabled: Boolean(organisationId) }
  );
  const action = useAction();
  const [reviewAction, setReviewAction] = useState(null);

  async function confirmReview(note) {
    await action.run("review", () =>
      reviewOrganisation(organisationId, {
        action: reviewAction.action,
        note,
      })
    );
    reload();
    onChanged?.();
  }

  const availableActions = REVIEW_ACTIONS.filter((option) => {
    if (!organisation) return false;
    if (organisation.is_suspended) return option.action === "REACTIVATE";
    if (option.action === "REACTIVATE") return false;
    if (organisation.verification_status === "VERIFIED") {
      return ["SUSPEND", "REQUEST_DOCUMENTS"].includes(option.action);
    }
    return ["APPROVE", "REJECT", "REQUEST_DOCUMENTS"].includes(option.action);
  });

  return (
    <Modal
      open={Boolean(organisationId)}
      onClose={onClose}
      wide
      title={organisation?.name || "Organisation profile"}
      description={
        organisation
          ? `${formatRole(organisation.organisation_type)} · ${
              organisation.city || organisation.state || "Location not set"
            }`
          : "Loading organisation"
      }
      footer={
        organisation ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              Registered {formatDate(organisation.created_at)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableActions.map((option) => (
                <Button
                  key={option.action}
                  size="sm"
                  variant={option.tone === "danger" ? "danger" : "primary"}
                  onClick={() => setReviewAction(option)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null
      }
    >
      {loading && !organisation ? (
        <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
      ) : error ? (
        <ErrorState
          compact
          title="Organisation unavailable"
          message={error}
          onRetry={reload}
        />
      ) : organisation ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge value={organisation.verification_status} />
            <Badge variant="forest">
              {formatRole(organisation.organisation_type)}
            </Badge>
            {organisation.is_suspended && <Badge variant="danger">Suspended</Badge>}
            <Badge variant="neutral">
              {formatNumber(organisation.document_count, 0)} documents
            </Badge>
          </div>

          <DetailGrid
            rows={[
              ["Owner", organisation.owner?.name || organisation.owner?.email || "—"],
              ["Registration", organisation.registration_number || "—"],
              ["GSTIN", organisation.gstin || "—"],
              ["Contact email", organisation.contact_email || "—"],
              ["Contact phone", organisation.contact_phone || "—"],
              ["Website", organisation.website || "—"],
              ["Address", organisation.address || "—"],
              ["City", organisation.city || "—"],
              ["State", organisation.state || "—"],
              ["Pincode", organisation.pincode || "—"],
              [
                "Capacity",
                organisation.capacity_kwp
                  ? `${formatNumber(organisation.capacity_kwp, 2)} kWp`
                  : "—",
              ],
              [
                "Serviceable states",
                (organisation.serviceable_states || []).join(", ") || "—",
              ],
              [
                "Energy types",
                (organisation.energy_types || []).join(", ") || "—",
              ],
              [
                "Accepted categories",
                (organisation.accepted_categories || []).join(", ") || "—",
              ],
              [
                "Verified",
                organisation.verified_at
                  ? formatDateTime(organisation.verified_at)
                  : "Not verified",
              ],
            ]}
          />

          {organisation.description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-800">About</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                {organisation.description}
              </p>
            </div>
          )}

          {organisation.verification_note && (
            <NoteBanner title="Verification note">
              {organisation.verification_note}
            </NoteBanner>
          )}

          {action.error && (
            <NoteBanner tone="danger" title="Action failed">
              {action.error}
            </NoteBanner>
          )}

          <DocumentPanel
            entityType="ORGANISATION"
            entityId={organisation.id}
            canReview
            documentTypes={[
              "REGISTRATION_CERTIFICATE",
              "GST_CERTIFICATE",
              "PAN_CARD",
              "LICENCE",
              "SUPPORTING",
            ]}
            title="Verification documents"
            description="Administrators can accept or reject submitted evidence."
          />

          <Card reveal={false}>
            <CardHeader
              title="Verification history"
              description="Every submission and decision recorded for this organisation."
              icon={Activity}
              action={
                <Badge variant="neutral">
                  {(organisation.history || []).length} entries
                </Badge>
              }
            />
            <CardBody>
              <Timeline
                events={(organisation.history || []).map((entry) => ({
                  id: entry.id,
                  status: entry.status_after,
                  note: entry.note,
                  actor_role: entry.action,
                  created_at: entry.created_at,
                }))}
                emptyMessage="No verification events recorded yet."
              />
            </CardBody>
          </Card>

          <ActionModal
            open={Boolean(reviewAction)}
            onClose={() => setReviewAction(null)}
            title={`${reviewAction?.label || "Review"} organisation`}
            description={
              organisation
                ? `${organisation.name} · ${formatRole(organisation.organisation_type)}`
                : ""
            }
            confirmLabel={reviewAction?.label || "Confirm"}
            tone={reviewAction?.tone === "danger" ? "danger" : "primary"}
            requireNote={reviewAction?.requireNote}
            placeholder="Explain the decision. This note is shared with the organisation."
            busy={action.busy === "review"}
            onConfirm={confirmReview}
          />
        </div>
      ) : null}
    </Modal>
  );
}

function OrganisationsPanel() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [type, setType] = useState("All");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);

  const organisations = useApiData(
    () =>
      getOrganisations({
        status: status === "All" ? undefined : status,
        organisationType: type === "All" ? undefined : type,
        search,
        page,
        pageSize: 12,
      }),
    [status, type, search, page]
  );

  const items = organisations.data?.items || [];
  const counts = useMemo(() => {
    const result = {};
    items.forEach((item) => {
      result[item.verification_status] =
        (result[item.verification_status] || 0) + 1;
    });
    return result;
  }, [items]);

  function submitSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <form className="flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search name, registration, GSTIN or contact…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search organisations"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter verification status"
            >
              <option value="All">All statuses</option>
              {VERIFICATION_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {titleCaseToken(option)}
                </option>
              ))}
            </select>
            <select
              className="field h-9 w-auto text-xs"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              aria-label="Filter organisation type"
            >
              <option value="All">All types</option>
              {ORGANISATION_TYPES.map((option) => (
                <option key={option} value={option}>
                  {formatRole(option)}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
        </CardBody>
      </Card>

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {["PENDING", "VERIFIED", "DOCUMENTS_REQUESTED"].map((key) => (
            <div
              key={key}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                {titleCaseToken(key)}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {counts[key] || 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {organisations.error ? (
        <ErrorState
          title="Organisations unavailable"
          message={organisations.error}
          onRetry={organisations.reload}
        />
      ) : organisations.loading && !organisations.data ? (
        <div className="h-56 animate-pulse rounded-xl bg-white shadow-card" />
      ) : items.length ? (
        <>
          <Card>
            <CardHeader
              title="Organisation register"
              description="Review business registrations, documents and verification decisions."
              icon={Building2}
              action={
                <Badge variant="neutral">
                  {formatNumber(organisations.data.total, 0)} organisations
                </Badge>
              }
            />
            <CardBody>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Organisation</th>
                      <th className="pb-2 font-semibold">Type</th>
                      <th className="pb-2 font-semibold">Contact</th>
                      <th className="pb-2 text-right font-semibold">Documents</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 font-semibold">Registered</th>
                      <th className="pb-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-2.5">
                          <p className="font-medium text-slate-800">{item.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {item.city || item.state || "Location not set"}
                          </p>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {formatRole(item.organisation_type)}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {item.contact_email || item.owner?.email || "—"}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(item.document_count, 0)}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge value={item.verification_status} />
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailId(item.id)}
                          >
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={organisations.data.page}
                pages={organisations.data.pages}
                total={organisations.data.total}
                onChange={setPage}
                label="organisations"
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={Building2}
          title="No organisations found"
          description="Adjust the search or filters to find registrations awaiting review."
        />
      )}

      <OrganisationDetail
        organisationId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={organisations.reload}
      />
    </div>
  );
}

function PolicyPanel() {
  const aggregates = useApiData(getPolicyAggregates, []);
  const data = aggregates.data || {};
  const roles = Object.entries(data.users_by_role || {});
  const compliance = data.verified_compliance || {};
  const loans = data.approved_green_loans || {};

  if (aggregates.error) {
    return (
      <ErrorState
        title="Policy aggregates unavailable"
        message={aggregates.error}
        onRetry={aggregates.reload}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Verified filings"
          value={formatNumber(compliance.filings, 0)}
          detail={`${formatNumber(compliance.renewable_mwh, 1)} MWh renewable`}
          icon={ClipboardCheck}
          tone="forest"
          loading={aggregates.loading}
        />
        <StatCard
          label="Verified shortfall"
          value={`${formatNumber(compliance.shortfall_mwh, 1)} MWh`}
          detail={`${formatNumber(compliance.obligated_mwh, 1)} MWh obligated`}
          icon={Activity}
          tone="amber"
          loading={aggregates.loading}
        />
        <StatCard
          label="Approved green loans"
          value={formatNumber(loans.count, 0)}
          detail={`₹${formatNumber(loans.amount, 0)} sanctioned`}
          icon={HandCoins}
          tone="emerald"
          loading={aggregates.loading}
        />
        <StatCard
          label="Stakeholder roles"
          value={formatNumber(roles.length, 0)}
          detail="Accounts across the ecosystem"
          icon={Users}
          tone="sky"
          loading={aggregates.loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Accounts by role"
            description="Registered stakeholder accounts on the platform."
            icon={Users}
            action={<Badge variant="neutral">{roles.length} roles</Badge>}
          />
          <CardBody>
            {roles.length ? (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Role</th>
                      <th className="pb-2 text-right font-semibold">Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map(([role, count]) => (
                      <tr
                        key={role}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-2.5 font-medium text-slate-700">
                          {formatRole(role)}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(count, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No stakeholder accounts recorded yet.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Aggregate provenance"
            description="Policy figures are platform-derived, not official statistics."
            icon={ShieldCheck}
          />
          <CardBody className="space-y-3">
            <ProvenanceNote
              block={{
                label: "Policy aggregates",
                provenance: {
                  classification: "PLATFORM_RECORDED",
                  note: data.note,
                },
              }}
            />
            <div className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
              <span className="text-slate-500">Verified filings</span>
              <span className="font-semibold text-slate-800">
                {formatNumber(compliance.filings, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
              <span className="text-slate-500">Renewable energy</span>
              <span className="font-semibold text-slate-800">
                {formatNumber(compliance.renewable_mwh, 1)} MWh
              </span>
            </div>
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-slate-500">Loan value</span>
              <span className="font-semibold text-slate-800">
                ₹{formatNumber(loans.amount, 0)}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={aggregates.reload}
              loading={aggregates.loading}
            >
              <RefreshCw size={13} /> Refresh aggregates
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function AdminEcosystemPage() {
  const [tab, setTab] = useState("monitoring");
  const overview = useApiData(getPlatformOverview, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration · ecosystem operations"
        icon={ShieldCheck}
        title="Ecosystem control"
        description="Verify organisations, monitor cross-workflow activity and review platform-derived policy signals."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={overview.reload}
            loading={overview.loading}
          >
            <RefreshCw size={13} /> Refresh
          </Button>
        }
      />

      <NoteBanner title="Platform-recorded figures">
        Monitoring and policy figures are computed live from transactional workflow
        records on this platform. They are not official government statistics.
      </NoteBanner>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <TabButton
            key={item.key}
            tab={item}
            active={tab === item.key}
            onClick={() => setTab(item.key)}
          />
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-slate-400">
          <Layers size={12} /> Cross-workflow oversight
        </span>
      </div>

      {tab === "monitoring" && (
        <MonitoringPanel overview={overview} onRefresh={overview.reload} />
      )}
      {tab === "organisations" && <OrganisationsPanel />}
      {tab === "policy" && <PolicyPanel />}
    </div>
  );
}
