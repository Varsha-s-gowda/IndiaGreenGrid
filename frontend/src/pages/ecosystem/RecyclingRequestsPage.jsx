import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Recycle,
  RefreshCw,
  Search,
  Truck,
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
import {
  ActionModal,
  DetailGrid,
  DocumentPanel,
  Field,
  NoteBanner,
  Timeline,
  useAction,
} from "../../components/ecosystem/EcosystemKit";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { INDIAN_STATES, titleCaseToken } from "../../lib/constants";
import {
  formatDate,
  formatDateTime,
  formatNumber,
} from "../../lib/formatters";
import {
  acceptRecyclingRequest,
  cancelRecyclingRequest,
  completeRecyclingRequest,
  createRecyclingRequest,
  getRecyclingAnalytics,
  getRecyclingCategories,
  getRecyclingRequest,
  getRecyclingRequests,
  recordRecyclingCollection,
  recordRecyclingProcessing,
  rejectRecyclingRequest,
  scheduleRecyclingPickup,
} from "../../services/ecosystemService";

const STATUS_OPTIONS = [
  "REQUESTED",
  "ACCEPTED",
  "PICKUP_SCHEDULED",
  "COLLECTED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

const FALLBACK_CATEGORIES = [
  { value: "LITHIUM_ION", label: "Lithium-ion batteries" },
  { value: "EV_BATTERY", label: "EV batteries" },
  { value: "SOLAR_PANEL", label: "Solar panels" },
  { value: "EWASTE", label: "Electronic waste" },
  { value: "LEAD_ACID", label: "Lead-acid batteries" },
  { value: "OTHER", label: "Other approved recyclable materials" },
];

const EMPTY_REQUEST = {
  waste_category: "SOLAR_PANEL",
  estimated_weight_kg: "",
  address: "",
  city: "",
  state: "Maharashtra",
  pincode: "",
  preferred_pickup_date: "",
  description: "",
};

function RecyclingDetail({ requestId, role, onClose, onChanged }) {
  const { data: request, loading, error, reload } = useApiData(
    () => getRecyclingRequest(requestId),
    [requestId],
    { enabled: Boolean(requestId) }
  );
  const action = useAction();
  const [decision, setDecision] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState({
    scheduled_pickup_at: "",
    assigned_personnel: "",
    note: "",
  });
  const [collectOpen, setCollectOpen] = useState(false);
  const [collection, setCollection] = useState({ actual_weight_kg: "", note: "" });
  const [processOpen, setProcessOpen] = useState(false);
  const [processing, setProcessing] = useState({
    processing_details: "",
    note: "",
    materials: [{ material: "", quantity_kg: "" }],
  });
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);

  const isApplicant = ["CITIZEN", "RESIDENT", "INDUSTRY"].includes(role);
  const isRecycler = role === "RECYCLER";
  const canCancel =
    isApplicant &&
    request &&
    !["COMPLETED", "CANCELLED", "REJECTED"].includes(request.status);

  async function run(task) {
    await action.run("action", task);
    reload();
    onChanged?.();
  }

  async function confirmDecision(note) {
    await run(() => decision.task(note));
    setDecision(null);
  }

  async function submitSchedule(event) {
    event.preventDefault();
    setBusy(true);
    setModalError("");
    try {
      await scheduleRecyclingPickup(requestId, {
        scheduled_pickup_at: new Date(schedule.scheduled_pickup_at).toISOString(),
        assigned_personnel: schedule.assigned_personnel,
        note: schedule.note,
      });
      setScheduleOpen(false);
      setSchedule({ scheduled_pickup_at: "", assigned_personnel: "", note: "" });
      reload();
      onChanged?.();
    } catch (error_) {
      setModalError(error_?.message || "The pickup could not be scheduled.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCollection(event) {
    event.preventDefault();
    setBusy(true);
    setModalError("");
    try {
      await recordRecyclingCollection(requestId, {
        actual_weight_kg: Number(collection.actual_weight_kg),
        note: collection.note,
      });
      setCollectOpen(false);
      setCollection({ actual_weight_kg: "", note: "" });
      reload();
      onChanged?.();
    } catch (error_) {
      setModalError(error_?.message || "The collection could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProcessing(event) {
    event.preventDefault();
    setBusy(true);
    setModalError("");
    try {
      await recordRecyclingProcessing(requestId, {
        processing_details: processing.processing_details,
        note: processing.note,
        recovered_materials: processing.materials
          .filter((item) => item.material.trim())
          .map((item) => ({
            material: item.material.trim(),
            quantity_kg: Number(item.quantity_kg || 0),
          })),
      });
      setProcessOpen(false);
      setProcessing({
        processing_details: "",
        note: "",
        materials: [{ material: "", quantity_kg: "" }],
      });
      reload();
      onChanged?.();
    } catch (error_) {
      setModalError(error_?.message || "Processing could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  const materials = request?.recovered_materials || [];

  return (
    <Modal
      open={Boolean(requestId)}
      onClose={onClose}
      wide
      title={
        request
          ? `${titleCaseToken(request.waste_category)} pickup`
          : "Recycling request"
      }
      description={
        request
          ? `${request.reference} · ${formatNumber(
              request.estimated_weight_kg,
              1
            )} kg estimated`
          : "Loading request"
      }
      footer={
        request ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              Requested {formatDate(request.created_at)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {isRecycler && request.status === "REQUESTED" && (
                <>
                  <Button
                    size="sm"
                    loading={action.busy === "action"}
                    onClick={() =>
                      setDecision({
                        title: "Accept pickup request",
                        confirmLabel: "Accept request",
                        task: (note) => acceptRecyclingRequest(requestId, note),
                      })
                    }
                  >
                    <CheckCircle2 size={13} /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDecision({
                        title: "Decline pickup request",
                        confirmLabel: "Decline request",
                        tone: "danger",
                        task: (note) => rejectRecyclingRequest(requestId, note),
                      })
                    }
                  >
                    <XCircle size={13} /> Decline
                  </Button>
                </>
              )}
              {isRecycler && request.status === "ACCEPTED" && (
                <>
                  <Button size="sm" onClick={() => setScheduleOpen(true)}>
                    <Truck size={13} /> Schedule pickup
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDecision({
                        title: "Decline pickup request",
                        confirmLabel: "Decline request",
                        tone: "danger",
                        task: (note) => rejectRecyclingRequest(requestId, note),
                      })
                    }
                  >
                    <XCircle size={13} /> Decline
                  </Button>
                </>
              )}
              {isRecycler && request.status === "PICKUP_SCHEDULED" && (
                <Button size="sm" onClick={() => setCollectOpen(true)}>
                  <CheckCircle2 size={13} /> Record collection
                </Button>
              )}
              {isRecycler &&
                ["COLLECTED", "PROCESSING"].includes(request.status) && (
                  <>
                    <Button size="sm" onClick={() => setProcessOpen(true)}>
                      <Recycle size={13} /> Record processing
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setDecision({
                          title: "Complete recycling request",
                          confirmLabel: "Issue certificate",
                          task: (note) => completeRecyclingRequest(requestId, note),
                        })
                      }
                    >
                      <CheckCircle2 size={13} /> Complete & certify
                    </Button>
                  </>
                )}
              {canCancel && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDecision({
                      title: "Cancel pickup request",
                      confirmLabel: "Cancel request",
                      tone: "danger",
                      task: (note) => cancelRecyclingRequest(requestId, note),
                    })
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
        <ErrorState
          compact
          title="Recycling request unavailable"
          message={error}
          onRetry={reload}
        />
      ) : request ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge value={request.status} />
            <Badge variant="forest">
              {titleCaseToken(request.waste_category)}
            </Badge>
            <Badge variant="neutral">
              {formatNumber(request.actual_weight_kg || 0, 1)} kg collected
            </Badge>
            {request.certificate_code && (
              <Badge variant="success">{request.certificate_code}</Badge>
            )}
          </div>

          <DetailGrid
            rows={[
              ["Requester", request.citizen?.name || "—"],
              ["Recycling centre", request.organisation_name || "Open marketplace"],
              ["Address", `${request.address}, ${request.city}`],
              ["State", request.state],
              [
                "Preferred pickup",
                request.preferred_pickup_date
                  ? formatDate(request.preferred_pickup_date)
                  : "Flexible",
              ],
              [
                "Scheduled pickup",
                request.scheduled_pickup_at
                  ? formatDateTime(request.scheduled_pickup_at)
                  : "—",
              ],
              ["Personnel", request.assigned_personnel || "—"],
              [
                "Collected",
                request.collected_at ? formatDateTime(request.collected_at) : "—",
              ],
              [
                "Completed",
                request.completed_at ? formatDateTime(request.completed_at) : "—",
              ],
            ]}
          />

          {request.description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-800">Description</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                {request.description}
              </p>
            </div>
          )}

          {(request.rejection_reason || request.cancellation_reason) && (
            <NoteBanner
              tone="danger"
              title={request.rejection_reason ? "Declined" : "Cancelled"}
            >
              {request.rejection_reason || request.cancellation_reason}
            </NoteBanner>
          )}

          {request.processing_details && (
            <div>
              <h3 className="text-xs font-semibold text-slate-800">
                Processing record
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                {request.processing_details}
              </p>
            </div>
          )}

          {materials.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-800">
                Recovered materials
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {materials.map((material, index) => (
                  <div
                    key={`${material.material}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[11px]"
                  >
                    <span className="text-slate-600">{material.material}</span>
                    <span className="font-semibold text-slate-800">
                      {formatNumber(material.quantity_kg, 2)} kg
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Card reveal={false}>
            <CardHeader
              title="Pickup timeline"
              description="Every transition is recorded with the acting role."
              icon={Truck}
            />
            <CardBody>
              <Timeline events={request.events || []} />
            </CardBody>
          </Card>

          <DocumentPanel
            entityType="RECYCLING_REQUEST"
            entityId={request.id}
            canUpload={isApplicant}
            documentTypes={["WASTE_PHOTO", "PURCHASE_INVOICE", "SUPPORTING"]}
            description="Photos and invoices help the recycling centre verify the material."
          />

          {action.error && (
            <NoteBanner tone="danger" title="Action failed">
              {action.error}
            </NoteBanner>
          )}

          <ActionModal
            open={Boolean(decision)}
            onClose={() => setDecision(null)}
            title={decision?.title || "Confirm action"}
            description={`For ${request.reference}`}
            confirmLabel={decision?.confirmLabel || "Confirm"}
            tone={decision?.tone || "primary"}
            busy={action.busy === "action"}
            onConfirm={confirmDecision}
          />

          <Modal
            open={scheduleOpen}
            onClose={() => setScheduleOpen(false)}
            title="Schedule pickup"
            description={`For ${request.reference}`}
          >
            <form className="space-y-3" onSubmit={submitSchedule}>
              <Field label="Pickup date and time">
                <input
                  className="field mt-1 h-9 w-full text-xs"
                  type="datetime-local"
                  required
                  value={schedule.scheduled_pickup_at}
                  onChange={(event) =>
                    setSchedule({
                      ...schedule,
                      scheduled_pickup_at: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Assigned personnel">
                <input
                  className="field mt-1 h-9 w-full text-xs"
                  value={schedule.assigned_personnel}
                  onChange={(event) =>
                    setSchedule({
                      ...schedule,
                      assigned_personnel: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Note">
                <textarea
                  className="field mt-1 min-h-[70px] w-full text-xs"
                  value={schedule.note}
                  onChange={(event) =>
                    setSchedule({ ...schedule, note: event.target.value })
                  }
                />
              </Field>
              {modalError && <NoteBanner tone="danger">{modalError}</NoteBanner>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScheduleOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={busy}>
                  Schedule pickup
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            open={collectOpen}
            onClose={() => setCollectOpen(false)}
            title="Record collected weight"
            description={`For ${request.reference}`}
          >
            <form className="space-y-3" onSubmit={submitCollection}>
              <Field label="Actual weight (kg)">
                <input
                  className="field mt-1 h-9 w-full text-xs"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={collection.actual_weight_kg}
                  onChange={(event) =>
                    setCollection({
                      ...collection,
                      actual_weight_kg: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Note">
                <textarea
                  className="field mt-1 min-h-[70px] w-full text-xs"
                  value={collection.note}
                  onChange={(event) =>
                    setCollection({ ...collection, note: event.target.value })
                  }
                />
              </Field>
              {modalError && <NoteBanner tone="danger">{modalError}</NoteBanner>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollectOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={busy}>
                  Record collection
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            open={processOpen}
            onClose={() => setProcessOpen(false)}
            title="Record processing and recovery"
            description={`For ${request.reference}`}
            wide
          >
            <form className="space-y-3" onSubmit={submitProcessing}>
              <Field label="Processing details">
                <textarea
                  className="field mt-1 min-h-[90px] w-full text-xs"
                  required
                  minLength={3}
                  value={processing.processing_details}
                  onChange={(event) =>
                    setProcessing({
                      ...processing,
                      processing_details: event.target.value,
                    })
                  }
                />
              </Field>
              <div>
                <p className="text-[11px] font-semibold text-slate-700">
                  Recovered materials
                </p>
                <div className="mt-1 space-y-2">
                  {processing.materials.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        className="field h-9 flex-1 text-xs"
                        placeholder="Material (e.g. Aluminium)"
                        value={item.material}
                        onChange={(event) => {
                          const materials = [...processing.materials];
                          materials[index] = {
                            ...materials[index],
                            material: event.target.value,
                          };
                          setProcessing({ ...processing, materials });
                        }}
                      />
                      <input
                        className="field h-9 w-28 text-xs"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="kg"
                        value={item.quantity_kg}
                        onChange={(event) => {
                          const materials = [...processing.materials];
                          materials[index] = {
                            ...materials[index],
                            quantity_kg: event.target.value,
                          };
                          setProcessing({ ...processing, materials });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1"
                  onClick={() =>
                    setProcessing({
                      ...processing,
                      materials: [
                        ...processing.materials,
                        { material: "", quantity_kg: "" },
                      ],
                    })
                  }
                >
                  <Plus size={12} /> Add material
                </Button>
              </div>
              <Field label="Note">
                <textarea
                  className="field mt-1 min-h-[70px] w-full text-xs"
                  value={processing.note}
                  onChange={(event) =>
                    setProcessing({ ...processing, note: event.target.value })
                  }
                />
              </Field>
              {modalError && <NoteBanner tone="danger">{modalError}</NoteBanner>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProcessOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={busy}>
                  Save processing
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      ) : null}
    </Modal>
  );
}

export default function RecyclingRequestsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isApplicant = ["CITIZEN", "RESIDENT", "INDUSTRY"].includes(role);
  const isRecycler = role === "RECYCLER";

  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All");
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

  const categories = useApiData(getRecyclingCategories, []);
  const requests = useApiData(
    () =>
      getRecyclingRequests({
        status: status === "All" ? undefined : status,
        wasteCategory: category === "All" ? undefined : category,
        search,
        page,
        pageSize: 10,
      }),
    [status, category, search, page]
  );
  const analytics = useApiData(getRecyclingAnalytics, [], {
    enabled: isRecycler,
  });

  const categoryOptions =
    categories.data?.items?.length > 0 ? categories.data.items : FALLBACK_CATEGORIES;
  const items = requests.data?.items || [];
  const summary = useMemo(() => {
    const counts = {};
    items.forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [items]);

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
      await createRecyclingRequest({
        ...form,
        estimated_weight_kg: Number(form.estimated_weight_kg),
        preferred_pickup_date: form.preferred_pickup_date || null,
      });
      setCreateOpen(false);
      setForm({ ...EMPTY_REQUEST, state: user?.state || "Maharashtra" });
      requests.reload();
      analytics.reload();
    } catch (error) {
      setFormError(error?.message || "The pickup request could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow D · circular economy"
        icon={Recycle}
        title={isRecycler ? "Recycling pickup queue" : "Recycling pickups"}
        description={
          isRecycler
            ? "Accept e-waste, battery and solar-panel pickups, record recovery and issue certificates."
            : "Request a verified collection for end-of-life panels, batteries and e-waste."
        }
        actions={
          <>
            {isApplicant && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} /> New pickup
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={requests.reload}
              loading={requests.loading}
            >
              <RefreshCw size={13} /> Refresh
            </Button>
          </>
        }
      />

      {isRecycler && analytics.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Assigned requests", analytics.data.requests],
            ["Completed", analytics.data.completed],
            [
              "Collected",
              `${formatNumber(analytics.data.collected_weight_kg, 1)} kg`,
            ],
            [
              "Recovered",
              `${formatNumber(analytics.data.recovered_material_kg, 1)} kg`,
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {isRecycler && analytics.data?.certificates > 0 && (
        <NoteBanner title="Recycling certificates issued">
          {formatNumber(analytics.data.certificates, 0)} certificates have been issued
          for completed pickups. Certificate codes are visible on each completed
          request.
        </NoteBanner>
      )}

      {!isRecycler && role !== "ADMIN" && (
        <NoteBanner title="Verified recycling partners">
          Requests are broadcast to verified recycling facilities that accept the
          selected waste category in your state. You are notified when a facility
          accepts.
        </NoteBanner>
      )}

      {isRecycler && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {["REQUESTED", "PICKUP_SCHEDULED", "PROCESSING"].map((key) => (
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
          <form className="flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search reference, city or address…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search recycling requests"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter recycling status"
            >
              <option value="All">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {titleCaseToken(option)}
                </option>
              ))}
            </select>
            <select
              className="field h-9 w-auto text-xs"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              aria-label="Filter waste category"
            >
              <option value="All">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
          title="Recycling requests unavailable"
          message={requests.error}
          onRetry={requests.reload}
        />
      ) : requests.loading && !requests.data ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-44 animate-pulse rounded-xl bg-white shadow-card" />
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
                        {titleCaseToken(item.waste_category)}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {item.city}, {item.state} ·{" "}
                        {formatNumber(item.estimated_weight_kg, 1)} kg
                      </p>
                    </div>
                    <StatusBadge value={item.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Recycler</p>
                      <p className="truncate font-semibold text-slate-800">
                        {item.organisation_name || "Open"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Collected</p>
                      <p className="font-semibold text-slate-800">
                        {item.actual_weight_kg
                          ? `${formatNumber(item.actual_weight_kg, 1)} kg`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Requested</p>
                      <p className="font-semibold text-slate-800">
                        {formatDate(item.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] text-slate-400">
                      {item.certificate_code
                        ? `Certificate ${item.certificate_code}`
                        : item.scheduled_pickup_at
                          ? `Pickup ${formatDate(item.scheduled_pickup_at)}`
                          : "Pickup not scheduled"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailId(item.id)}
                    >
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
            label="pickups"
          />
        </>
      ) : (
        <EmptyState
          icon={Recycle}
          title="No recycling pickups"
          description={
            isApplicant
              ? "Create a pickup request for end-of-life solar panels, batteries or e-waste."
              : "Pickup requests in your scope will appear here."
          }
          action={
            isApplicant ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} /> Request pickup
              </Button>
            ) : null
          }
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New recycling pickup"
        description="Verified facilities accepting this material in your state are notified."
        wide
      >
        <form className="space-y-3" onSubmit={submitCreate}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Waste category">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={form.waste_category}
                onChange={(event) =>
                  setForm({ ...form, waste_category: event.target.value })
                }
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estimated weight (kg)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.estimated_weight_kg}
                onChange={(event) =>
                  setForm({ ...form, estimated_weight_kg: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Pickup address">
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
          <Field label="Preferred pickup date">
            <input
              className="field mt-1 h-9 w-full text-xs"
              type="date"
              value={form.preferred_pickup_date}
              onChange={(event) =>
                setForm({ ...form, preferred_pickup_date: event.target.value })
              }
            />
          </Field>
          <Field label="Material description">
            <textarea
              className="field mt-1 min-h-[80px] w-full text-xs"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
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

      <RecyclingDetail
        requestId={detailId}
        role={role}
        onClose={() => setDetailId(null)}
        onChanged={() => {
          requests.reload();
          analytics.reload();
        }}
      />
    </div>
  );
}
