import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sun,
  Wrench,
  XCircle,
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
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { INDIAN_STATES, titleCaseToken } from "../../lib/constants";
import {
  formatCapacity,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  acceptQuotation,
  acceptSolarRequest,
  cancelSolarRequest,
  createSolarRequest,
  getInstallers,
  getSolarRequest,
  getSolarRequests,
  rejectQuotation,
  rejectSolarRequest,
  scheduleSolarInspection,
  submitSolarQuotation,
  updateSolarProgress,
} from "../../services/ecosystemService";
import {
  DetailGrid,
  DocumentPanel,
  NoteBanner,
  useAction,
} from "../../components/ecosystem/EcosystemKit";

const STATUS_OPTIONS = [
  "REQUESTED",
  "ACCEPTED",
  "INSPECTION_SCHEDULED",
  "QUOTATION_SUBMITTED",
  "QUOTE_ACCEPTED",
  "INSTALLATION_STARTED",
  "INSTALLATION_COMPLETED",
  "REJECTED",
  "CANCELLED",
];

const EMPTY_REQUEST = {
  project_title: "",
  property_type: "RESIDENTIAL",
  address: "",
  city: "",
  state: "Maharashtra",
  pincode: "",
  roof_area_sqm: "",
  monthly_consumption_kwh: "",
  desired_capacity_kwp: "",
  additional_requirements: "",
  installer_id: "",
};

const EMPTY_QUOTE = {
  price: "",
  system_capacity_kwp: "",
  equipment_details: "",
  panel_details: "",
  inverter_details: "",
  installation_duration_days: 30,
  warranty_years: 5,
  description: "",
};

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}
    </label>
  );
}

function requestProgress(request) {
  if (!request) return 0;
  if (request.installation) return request.installation.progress_pct || 0;
  const map = {
    REQUESTED: 5,
    ACCEPTED: 20,
    INSPECTION_SCHEDULED: 35,
    QUOTATION_SUBMITTED: 45,
    QUOTE_ACCEPTED: 55,
    INSTALLATION_STARTED: 70,
    INSTALLATION_COMPLETED: 100,
  };
  return map[request.status] ?? 0;
}

function SolarRequestDetail({ requestId, role, onClose, onChanged }) {
  const { data, loading, error, reload } = useApiData(
    () => getSolarRequest(requestId),
    [requestId],
    { enabled: Boolean(requestId) }
  );
  const action = useAction();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState(EMPTY_QUOTE);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspection, setInspection] = useState({ scheduled_at: "", note: "" });
  const [progressOpen, setProgressOpen] = useState(false);
  const [progress, setProgress] = useState({
    status: "STARTED",
    progress_pct: 25,
    milestone: "",
    completion_notes: "",
  });

  const request = data;
  const isInstaller = role === "SOLAR_INSTALLER";
  const isCitizen = ["CITIZEN", "RESIDENT", "INDUSTRY"].includes(role);
  const quotes = request?.quotations || [];

  async function run(task) {
    await action.run("action", task);
    reload();
    onChanged?.();
  }

  async function submitQuote(event) {
    event.preventDefault();
    await run(() =>
      submitSolarQuotation(requestId, {
        ...quote,
        price: Number(quote.price),
        system_capacity_kwp: Number(quote.system_capacity_kwp),
        installation_duration_days: Number(quote.installation_duration_days),
        warranty_years: Number(quote.warranty_years),
      })
    );
    setQuoteOpen(false);
    setQuote(EMPTY_QUOTE);
  }

  async function submitInspection(event) {
    event.preventDefault();
    await run(() =>
      scheduleSolarInspection(requestId, {
        scheduled_at: new Date(inspection.scheduled_at).toISOString(),
        note: inspection.note,
      })
    );
    setInspectionOpen(false);
    setInspection({ scheduled_at: "", note: "" });
  }

  async function submitProgress(event) {
    event.preventDefault();
    await run(() =>
      updateSolarProgress(requestId, {
        status: progress.status,
        progress_pct: Number(progress.progress_pct),
        milestone: progress.milestone || null,
        completion_notes: progress.completion_notes || null,
      })
    );
    setProgressOpen(false);
  }

  return (
    <Modal
      open={Boolean(requestId)}
      onClose={onClose}
      wide
      title={request?.project_title || "Solar request"}
      description={
        request
          ? `${request.reference} · ${request.city}, ${request.state}`
          : "Loading request"
      }
      footer={
        request ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              Created {formatDate(request.created_at)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {isInstaller && request.status === "REQUESTED" && (
                <>
                  <Button
                    size="sm"
                    loading={action.busy === "action"}
                    onClick={() =>
                      run(() => acceptSolarRequest(requestId, "Accepted via installer workspace."))
                    }
                  >
                    <CheckCircle2 size={13} /> Accept request
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(() => rejectSolarRequest(requestId, "Not serviceable."))
                    }
                  >
                    <XCircle size={13} /> Decline
                  </Button>
                </>
              )}
              {isInstaller &&
                ["ACCEPTED", "INSPECTION_SCHEDULED"].includes(request.status) && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setInspectionOpen(true)}
                    >
                      <CalendarClock size={13} /> Schedule inspection
                    </Button>
                    <Button size="sm" onClick={() => setQuoteOpen(true)}>
                      <Send size={13} /> Submit quotation
                    </Button>
                  </>
                )}
              {isInstaller &&
                ["QUOTE_ACCEPTED", "INSTALLATION_STARTED"].includes(request.status) && (
                  <Button size="sm" onClick={() => setProgressOpen(true)}>
                    <Wrench size={13} /> Update progress
                  </Button>
                )}
              {isCitizen &&
                !["INSTALLATION_COMPLETED", "CANCELLED", "REJECTED"].includes(
                  request.status
                ) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(() => cancelSolarRequest(requestId, "Cancelled by requester."))
                    }
                  >
                    <XCircle size={13} /> Cancel request
                  </Button>
                )}
            </div>
          </div>
        ) : null
      }
    >
      {loading && !request ? (
        <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
      ) : error ? (
        <ErrorState compact title="Request unavailable" message={error} onRetry={reload} />
      ) : request ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge value={request.status} />
            <Badge variant="forest">{titleCaseToken(request.property_type)}</Badge>
            <Badge variant="neutral">{formatCapacity(request.desired_capacity_kwp)}</Badge>
            <Badge variant="neutral">{formatNumber(request.document_count, 0)} documents</Badge>
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Installation progress</span>
              <span>{requestProgress(request)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-forest-600 transition-all"
                style={{ width: `${requestProgress(request)}%` }}
              />
            </div>
          </div>

          <DetailGrid
            rows={[
              ["Address", `${request.address}, ${request.city}`],
              ["Pincode", request.pincode || "—"],
              ["Roof area", `${formatNumber(request.roof_area_sqm, 1)} sqm`],
              [
                "Monthly consumption",
                `${formatNumber(request.monthly_consumption_kwh, 0)} kWh`,
              ],
              ["Assigned installer", request.installer?.name || "Open marketplace"],
              [
                "Inspection",
                request.inspection_scheduled_at
                  ? formatDate(request.inspection_scheduled_at)
                  : "Not scheduled",
              ],
              ["Accepted", request.accepted_at ? formatDate(request.accepted_at) : "—"],
              ["Completed", request.completed_at ? formatDate(request.completed_at) : "—"],
            ]}
          />

          {request.additional_requirements && (
            <div>
              <h3 className="text-xs font-semibold text-slate-800">Requirements</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                {request.additional_requirements}
              </p>
            </div>
          )}

          {request.rejection_reason && (
            <NoteBanner tone="danger" title="Declined">
              {request.rejection_reason}
            </NoteBanner>
          )}

          <Card reveal={false}>
            <CardHeader
              title="Quotations"
              description="Compare installer pricing and equipment."
              icon={ClipboardList}
              action={<Badge variant="neutral">{quotes.length}</Badge>}
            />
            <CardBody>
              {quotes.length ? (
                <ul className="space-y-3">
                  {quotes.map((quotation) => (
                    <li
                      key={quotation.id}
                      className="rounded-lg border border-slate-200 px-3.5 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatCurrency(quotation.price)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {formatCapacity(quotation.system_capacity_kwp)} ·{" "}
                            {quotation.installation_duration_days} days ·{" "}
                            {quotation.warranty_years} yr warranty
                          </p>
                        </div>
                        <StatusBadge value={quotation.status} />
                      </div>
                      <p className="mt-1.5 text-[11px] leading-5 text-slate-600">
                        {quotation.description || quotation.equipment_details || "No scope note."}
                      </p>
                      {isCitizen && quotation.status === "SUBMITTED" && (
                        <div className="mt-2 flex gap-1.5">
                          <Button
                            size="sm"
                            onClick={() =>
                              run(() => acceptQuotation(quotation.id))
                            }
                          >
                            Accept quote
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              run(() =>
                                rejectQuotation(quotation.id, "Scope or price not suitable.")
                              )
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      )}
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

          <DocumentPanel
            entityType="SOLAR_REQUEST"
            entityId={request.id}
            canUpload={isCitizen}
            documentTypes={[
              "ELECTRICITY_BILL",
              "ROOF_OWNERSHIP",
              "IDENTITY_PROOF",
              "SUPPORTING",
            ]}
            description="Bills, roof ownership and identity proofs are visible to the assigned installer."
          />

          {action.error && (
            <NoteBanner tone="danger" title="Action failed">
              {action.error}
            </NoteBanner>
          )}

          <Modal
            open={quoteOpen}
            onClose={() => setQuoteOpen(false)}
            title="Submit quotation"
            description={`For ${request.reference}`}
          >
            <form className="space-y-3" onSubmit={submitQuote}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Total price (INR)">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="1"
                    required
                    value={quote.price}
                    onChange={(event) => setQuote({ ...quote, price: event.target.value })}
                  />
                </Field>
                <Field label="System capacity (kWp)">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={quote.system_capacity_kwp}
                    onChange={(event) =>
                      setQuote({ ...quote, system_capacity_kwp: event.target.value })
                    }
                  />
                </Field>
                <Field label="Installation days">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="1"
                    value={quote.installation_duration_days}
                    onChange={(event) =>
                      setQuote({
                        ...quote,
                        installation_duration_days: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Warranty years">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="0"
                    max="50"
                    value={quote.warranty_years}
                    onChange={(event) =>
                      setQuote({ ...quote, warranty_years: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Equipment details">
                <input
                  className="field mt-1 h-9 w-full text-xs"
                  value={quote.equipment_details}
                  onChange={(event) =>
                    setQuote({ ...quote, equipment_details: event.target.value })
                  }
                  placeholder="Modules, inverter, mounting structure"
                />
              </Field>
              <Field label="Scope description">
                <textarea
                  className="field mt-1 min-h-[90px] w-full text-xs"
                  value={quote.description}
                  onChange={(event) =>
                    setQuote({ ...quote, description: event.target.value })
                  }
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setQuoteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={action.busy === "action"}>
                  Send quotation
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            open={inspectionOpen}
            onClose={() => setInspectionOpen(false)}
            title="Schedule site inspection"
            description={`For ${request.reference}`}
          >
            <form className="space-y-3" onSubmit={submitInspection}>
              <Field label="Inspection date and time">
                <input
                  className="field mt-1 h-9 w-full text-xs"
                  type="datetime-local"
                  required
                  value={inspection.scheduled_at}
                  onChange={(event) =>
                    setInspection({ ...inspection, scheduled_at: event.target.value })
                  }
                />
              </Field>
              <Field label="Note">
                <textarea
                  className="field mt-1 min-h-[80px] w-full text-xs"
                  value={inspection.note}
                  onChange={(event) =>
                    setInspection({ ...inspection, note: event.target.value })
                  }
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInspectionOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={action.busy === "action"}>
                  Schedule
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            open={progressOpen}
            onClose={() => setProgressOpen(false)}
            title="Update installation progress"
            description={`For ${request.reference}`}
          >
            <form className="space-y-3" onSubmit={submitProgress}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status">
                  <select
                    className="field mt-1 h-9 w-full text-xs"
                    value={progress.status}
                    onChange={(event) =>
                      setProgress({ ...progress, status: event.target.value })
                    }
                  >
                    <option value="STARTED">Started</option>
                    <option value="ON_HOLD">On hold</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </Field>
                <Field label="Progress (%)">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="0"
                    max="100"
                    value={progress.progress_pct}
                    onChange={(event) =>
                      setProgress({ ...progress, progress_pct: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Milestone">
                <input
                  className="field mt-1 h-9 w-full text-xs"
                  value={progress.milestone}
                  onChange={(event) =>
                    setProgress({ ...progress, milestone: event.target.value })
                  }
                  placeholder="Mounting structure, wiring, commissioning…"
                />
              </Field>
              <Field label="Completion notes">
                <textarea
                  className="field mt-1 min-h-[80px] w-full text-xs"
                  value={progress.completion_notes}
                  onChange={(event) =>
                    setProgress({ ...progress, completion_notes: event.target.value })
                  }
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setProgressOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={action.busy === "action"}>
                  Save progress
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      ) : null}
    </Modal>
  );
}

export default function SolarRequestsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canCreate = ["CITIZEN", "RESIDENT", "INDUSTRY"].includes(role);
  const isInstaller = role === "SOLAR_INSTALLER";

  const [status, setStatus] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState({
    ...EMPTY_REQUEST,
    state: user?.state || "Maharashtra",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const requests = useApiData(
    () =>
      getSolarRequests({
        status: status === "All" ? undefined : status,
        search,
        page,
        pageSize: 10,
      }),
    [status, search, page]
  );
  const installers = useApiData(
    () => getInstallers({ pageSize: 50 }),
    [],
    { enabled: canCreate }
  );

  function submitSearch(event) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  async function submitCreate(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await createSolarRequest({
        ...form,
        roof_area_sqm: Number(form.roof_area_sqm),
        monthly_consumption_kwh: Number(form.monthly_consumption_kwh),
        desired_capacity_kwp: Number(form.desired_capacity_kwp),
        installer_id: form.installer_id ? Number(form.installer_id) : null,
      });
      setCreateOpen(false);
      setForm({ ...EMPTY_REQUEST, state: user?.state || "Maharashtra" });
      requests.reload();
    } catch (error) {
      setFormError(error?.message || "The request could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  const items = requests.data?.items || [];
  const summary = useMemo(() => {
    const counts = {};
    items.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [items]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isInstaller ? "Workflow A · installer" : "Workflow A · rooftop solar"}
        icon={Sun}
        title={isInstaller ? "Installation request inbox" : "My solar installation requests"}
        description={
          isInstaller
            ? "Open requests in your serviceable states, assigned jobs and installation progress."
            : "Request quotations from verified installers, accept the best offer and track commissioning."
        }
        actions={
          <>
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} />
                New request
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={requests.reload}
              loading={requests.loading}
            >
              <RefreshCw size={13} />
              Refresh
            </Button>
          </>
        }
      />

      {!isInstaller && (
        <NoteBanner title="Verified installer marketplace">
          Requests are visible only to verified installers serving your state. Your
          address and documents are shared only after an installer accepts the request.
        </NoteBanner>
      )}

      {isInstaller && (
        <div className="grid gap-3 sm:grid-cols-3">
          {["REQUESTED", "ACCEPTED", "INSTALLATION_STARTED"].map((key) => (
            <div
              key={key}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                {titleCaseToken(key)}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {summary[key] || 0}
              </p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardBody>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={submitSearch}
          >
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search reference, city or project…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search solar requests"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter request status"
            >
              <option value="All">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {titleCaseToken(option)}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
        </CardBody>
      </Card>

      {requests.error ? (
        <ErrorState
          title="Solar requests unavailable"
          message={requests.error}
          onRetry={requests.reload}
        />
      ) : requests.loading && !requests.data ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-40 animate-pulse rounded-xl bg-white shadow-card" />
          ))}
        </div>
      ) : items.length ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className="h-full">
                <CardBody className="pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-forest-700">
                        {item.reference}
                      </p>
                      <h3 className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                        {item.project_title}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {item.city}, {item.state} · {formatCapacity(item.desired_capacity_kwp)}
                      </p>
                    </div>
                    <StatusBadge value={item.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Quotations</p>
                      <p className="font-semibold text-slate-800">
                        {formatNumber(item.quotation_count, 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Progress</p>
                      <p className="font-semibold text-slate-800">
                        {formatPercent(requestProgress(item), 0)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-slate-400">
                      {item.installer?.name || "Open marketplace"} ·{" "}
                      {formatDate(item.created_at)}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setDetailId(item.id)}>
                      Open
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
          <Pagination
            page={requests.data.page}
            pages={requests.data.pages}
            total={requests.data.total}
            onChange={setPage}
            label="requests"
          />
        </>
      ) : (
        <EmptyState
          icon={Sun}
          title="No solar requests yet"
          description={
            canCreate
              ? "Start a rooftop installation request and receive quotations from verified installers."
              : "New requests in your serviceable states will appear here."
          }
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} /> Create request
              </Button>
            ) : null
          }
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New rooftop solar request"
        description="Verified installers serving your state will be notified."
        wide
      >
        <form className="space-y-3" onSubmit={submitCreate}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project title">
              <input
                className="field mt-1 h-9 w-full text-xs"
                required
                minLength={3}
                value={form.project_title}
                onChange={(event) => setForm({ ...form, project_title: event.target.value })}
              />
            </Field>
            <Field label="Property type">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={form.property_type}
                onChange={(event) => setForm({ ...form, property_type: event.target.value })}
              >
                {["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "INSTITUTIONAL"].map(
                  (type) => (
                    <option key={type} value={type}>
                      {titleCaseToken(type)}
                    </option>
                  )
                )}
              </select>
            </Field>
          </div>
          <Field label="Site address">
            <input
              className="field mt-1 h-9 w-full text-xs"
              required
              minLength={5}
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City">
              <input
                className="field mt-1 h-9 w-full text-xs"
                required
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </Field>
            <Field label="State">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={form.state}
                onChange={(event) => setForm({ ...form, state: event.target.value })}
              >
                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pincode">
              <input
                className="field mt-1 h-9 w-full text-xs"
                value={form.pincode}
                onChange={(event) => setForm({ ...form, pincode: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Roof area (sqm)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="1"
                required
                value={form.roof_area_sqm}
                onChange={(event) => setForm({ ...form, roof_area_sqm: event.target.value })}
              />
            </Field>
            <Field label="Monthly consumption (kWh)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="1"
                required
                value={form.monthly_consumption_kwh}
                onChange={(event) =>
                  setForm({ ...form, monthly_consumption_kwh: event.target.value })
                }
              />
            </Field>
            <Field label="Desired capacity (kWp)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0.1"
                step="0.1"
                required
                value={form.desired_capacity_kwp}
                onChange={(event) =>
                  setForm({ ...form, desired_capacity_kwp: event.target.value })
                }
              />
            </Field>
          </div>
          <Field
            label="Preferred installer (optional)"
            hint="Leave blank to publish to all verified installers serving your state."
          >
            <select
              className="field mt-1 h-9 w-full text-xs"
              value={form.installer_id}
              onChange={(event) => setForm({ ...form, installer_id: event.target.value })}
            >
              <option value="">Open marketplace</option>
              {(installers.data?.items || []).map((installer) => (
                <option key={installer.owner_id} value={installer.owner_id}>
                  {installer.name} · {installer.city || installer.state}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Additional requirements">
            <textarea
              className="field mt-1 min-h-[80px] w-full text-xs"
              value={form.additional_requirements}
              onChange={(event) =>
                setForm({ ...form, additional_requirements: event.target.value })
              }
            />
          </Field>
          {formError && <NoteBanner tone="danger">{formError}</NoteBanner>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Submit request
            </Button>
          </div>
        </form>
      </Modal>

      <SolarRequestDetail
        requestId={detailId}
        role={role}
        onClose={() => setDetailId(null)}
        onChanged={requests.reload}
      />
    </div>
  );
}
