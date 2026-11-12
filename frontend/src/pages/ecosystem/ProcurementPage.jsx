import { useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  Handshake,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
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
  useAction,
} from "../../components/ecosystem/EcosystemKit";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import { INDIAN_STATES, titleCaseToken } from "../../lib/constants";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../../lib/formatters";
import {
  awardProcurementRequest,
  cancelProcurementRequest,
  closeProcurementRequest,
  createProcurementRequest,
  getProcurementRequest,
  getProcurementRequests,
  publishProcurementRequest,
  submitSupplierQuotation,
} from "../../services/ecosystemService";

const STATUS_OPTIONS = [
  "DRAFT",
  "OPEN",
  "QUOTATION_RECEIVED",
  "UNDER_REVIEW",
  "AWARDED",
  "CLOSED",
  "CANCELLED",
];

const ENERGY_TYPES = ["ANY", "SOLAR", "WIND", "HYDRO", "OTHER"];

const EMPTY_REQUEST = {
  title: "",
  energy_type: "ANY",
  quantity_mwh: "",
  delivery_start: "",
  delivery_end: "",
  delivery_location: "",
  max_price_per_mwh: "",
  description: "",
};

const EMPTY_QUOTE = {
  quantity_mwh: "",
  price_per_mwh: "",
  delivery_period_days: 30,
  delivery_start: "",
  delivery_end: "",
  terms: "",
};

function ProcurementDetail({ requestId, role, onClose, onChanged }) {
  const { data: request, loading, error, reload } = useApiData(
    () => getProcurementRequest(requestId),
    [requestId],
    { enabled: Boolean(requestId) }
  );
  const action = useAction();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState(EMPTY_QUOTE);
  const [awardQuote, setAwardQuote] = useState(null);

  const isDiscom = role === "DISCOM";
  const isSupplier = role === "RENEWABLE_SUPPLIER";
  const canManage = isDiscom || role === "ADMIN";
  const quotations = request?.quotations || [];
  const myQuote = isSupplier ? quotations[0] : null;
  const canQuote =
    isSupplier &&
    request &&
    ["OPEN", "QUOTATION_RECEIVED"].includes(request.status) &&
    !myQuote;
  const canAward =
    canManage &&
    request &&
    ["OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW"].includes(request.status);

  async function run(task) {
    await action.run("action", task);
    reload();
    onChanged?.();
  }

  async function submitQuote(event) {
    event.preventDefault();
    await run(() =>
      submitSupplierQuotation(requestId, {
        ...quote,
        quantity_mwh: Number(quote.quantity_mwh),
        price_per_mwh: Number(quote.price_per_mwh),
        delivery_period_days: Number(quote.delivery_period_days),
        delivery_start: quote.delivery_start || null,
        delivery_end: quote.delivery_end || null,
      })
    );
    setQuoteOpen(false);
    setQuote(EMPTY_QUOTE);
  }

  return (
    <Modal
      open={Boolean(requestId)}
      onClose={onClose}
      wide
      title={request?.title || "Procurement request"}
      description={
        request
          ? `${request.reference} · ${titleCaseToken(request.energy_type)} · ${formatNumber(
              request.quantity_mwh,
              2
            )} MWh`
          : "Loading request"
      }
      footer={
        request ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">
              Created {formatDate(request.created_at)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {canManage && request.status === "DRAFT" && (
                <Button
                  size="sm"
                  loading={action.busy === "action"}
                  onClick={() => run(() => publishProcurementRequest(requestId))}
                >
                  <Send size={13} /> Publish request
                </Button>
              )}
              {canManage &&
                ["OPEN", "QUOTATION_RECEIVED", "UNDER_REVIEW", "AWARDED"].includes(
                  request.status
                ) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(() => closeProcurementRequest(requestId))
                    }
                  >
                    <CheckCircle2 size={13} /> Close
                  </Button>
                )}
              {canManage &&
                !["CLOSED", "CANCELLED"].includes(request.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run(() => cancelProcurementRequest(requestId))
                    }
                  >
                    <XCircle size={13} /> Cancel
                  </Button>
                )}
              {canQuote && (
                <Button size="sm" onClick={() => setQuoteOpen(true)}>
                  <Send size={13} /> Submit quotation
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
          title="Procurement request unavailable"
          message={error}
          onRetry={reload}
        />
      ) : request ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge value={request.status} />
            <Badge variant="forest">{titleCaseToken(request.energy_type)}</Badge>
            <Badge variant="neutral">
              {formatNumber(request.quantity_mwh, 2)} MWh
            </Badge>
            <Badge variant="neutral">
              {formatNumber(request.quotation_count, 0)} quotations
            </Badge>
          </div>

          <DetailGrid
            rows={[
              ["Buyer", request.discom?.name || request.discom?.email || "—"],
              ["Delivery location", request.delivery_location || "State-wide"],
              [
                "Delivery window",
                request.delivery_start
                  ? `${formatDate(request.delivery_start)} → ${
                      request.delivery_end ? formatDate(request.delivery_end) : "open"
                    }`
                  : "Not specified",
              ],
              [
                "Ceiling price",
                request.max_price_per_mwh
                  ? `${formatCurrency(request.max_price_per_mwh)} / MWh`
                  : "Open",
              ],
              [
                "Awarded",
                request.awarded_at ? formatDateTime(request.awarded_at) : "Pending",
              ],
              ["Closed", request.closed_at ? formatDateTime(request.closed_at) : "—"],
            ]}
          />

          {request.description && (
            <div>
              <h3 className="text-xs font-semibold text-slate-800">Requirement</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                {request.description}
              </p>
            </div>
          )}

          {isSupplier && myQuote && (
            <NoteBanner
              tone={
                myQuote.status === "AWARDED"
                  ? "info"
                  : myQuote.status === "REJECTED"
                    ? "warning"
                    : "info"
              }
              title={`Your quotation is ${titleCaseToken(myQuote.status)}`}
            >
              {formatNumber(myQuote.quantity_mwh, 2)} MWh at{" "}
              {formatCurrency(myQuote.price_per_mwh)}/MWh ·{" "}
              {formatCurrency(myQuote.total_price)} total
            </NoteBanner>
          )}

          <Card reveal={false}>
            <CardHeader
              title="Supplier quotations"
              description={
                isSupplier
                  ? "Your submitted offer for this requirement."
                  : "Compare commercial offers and award the contract."
              }
              icon={Package}
              action={<Badge variant="neutral">{quotations.length}</Badge>}
            />
            <CardBody>
              {quotations.length ? (
                <ul className="space-y-3">
                  {quotations.map((quotation) => (
                    <li
                      key={quotation.id}
                      className="rounded-lg border border-slate-200 px-3.5 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatCurrency(quotation.price_per_mwh)} / MWh
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {quotation.supplier_name || "Your organisation"} ·{" "}
                            {formatNumber(quotation.quantity_mwh, 2)} MWh ·{" "}
                            {formatCurrency(quotation.total_price)} total ·{" "}
                            {quotation.delivery_period_days} day delivery
                          </p>
                        </div>
                        <StatusBadge value={quotation.status} />
                      </div>
                      {quotation.terms && (
                        <p className="mt-1.5 text-[11px] leading-5 text-slate-600">
                          {quotation.terms}
                        </p>
                      )}
                      {canAward &&
                        ["SUBMITTED", "SHORTLISTED"].includes(quotation.status) && (
                          <div className="mt-2">
                            <Button
                              size="sm"
                              onClick={() => setAwardQuote(quotation)}
                            >
                              <Award size={13} /> Award contract
                            </Button>
                          </div>
                        )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  No supplier quotations submitted yet.
                </p>
              )}
            </CardBody>
          </Card>

          <DocumentPanel
            entityType="PROCUREMENT_REQUEST"
            entityId={request.id}
            canUpload={canManage}
            documentTypes={["TENDER_DOCUMENT", "SUPPORTING"]}
            description="Tender documents and supporting evidence for this requirement."
          />

          {action.error && (
            <NoteBanner tone="danger" title="Action failed">
              {action.error}
            </NoteBanner>
          )}

          <Modal
            open={quoteOpen}
            onClose={() => setQuoteOpen(false)}
            title="Submit procurement quotation"
            description={`For ${request.reference}`}
          >
            <form className="space-y-3" onSubmit={submitQuote}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quantity (MWh)">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={quote.quantity_mwh}
                    onChange={(event) =>
                      setQuote({ ...quote, quantity_mwh: event.target.value })
                    }
                  />
                </Field>
                <Field label="Price per MWh (INR)">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={quote.price_per_mwh}
                    onChange={(event) =>
                      setQuote({ ...quote, price_per_mwh: event.target.value })
                    }
                  />
                </Field>
                <Field label="Delivery period (days)">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="number"
                    min="1"
                    value={quote.delivery_period_days}
                    onChange={(event) =>
                      setQuote({
                        ...quote,
                        delivery_period_days: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Delivery start">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="date"
                    value={quote.delivery_start}
                    onChange={(event) =>
                      setQuote({ ...quote, delivery_start: event.target.value })
                    }
                  />
                </Field>
                <Field label="Delivery end">
                  <input
                    className="field mt-1 h-9 w-full text-xs"
                    type="date"
                    value={quote.delivery_end}
                    onChange={(event) =>
                      setQuote({ ...quote, delivery_end: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Commercial terms">
                <textarea
                  className="field mt-1 min-h-[90px] w-full text-xs"
                  value={quote.terms}
                  onChange={(event) =>
                    setQuote({ ...quote, terms: event.target.value })
                  }
                  placeholder="Payment terms, scheduling, transmission responsibilities"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuoteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={action.busy === "action"}
                >
                  Send quotation
                </Button>
              </div>
            </form>
          </Modal>

          <ActionModal
            open={Boolean(awardQuote)}
            onClose={() => setAwardQuote(null)}
            title="Award procurement contract"
            description={
              awardQuote
                ? `${awardQuote.supplier_name || "Supplier"} · ${formatCurrency(
                    awardQuote.total_price
                  )}`
                : ""
            }
            confirmLabel="Award contract"
            requireNote
            busy={action.busy === "action"}
            onConfirm={async (note) => {
              await run(() =>
                awardProcurementRequest(requestId, {
                  quotation_id: awardQuote.id,
                  note,
                })
              );
              setAwardQuote(null);
            }}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export default function ProcurementPage() {
  const { user } = useAuth();
  const role = user?.role;
  const isDiscom = role === "DISCOM";
  const isAdmin = role === "ADMIN";

  const [status, setStatus] = useState("All");
  const [energyType, setEnergyType] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState({
    ...EMPTY_REQUEST,
    delivery_location: user?.state || "",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const requests = useApiData(
    () =>
      getProcurementRequests({
        status: status === "All" ? undefined : status,
        energyType: energyType === "All" ? undefined : energyType,
        search,
        page,
        pageSize: 10,
      }),
    [status, energyType, search, page]
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
      await createProcurementRequest({
        ...form,
        quantity_mwh: Number(form.quantity_mwh),
        max_price_per_mwh: Number(form.max_price_per_mwh || 0),
        delivery_start: form.delivery_start || null,
        delivery_end: form.delivery_end || null,
      });
      setCreateOpen(false);
      setForm({ ...EMPTY_REQUEST, delivery_location: user?.state || "" });
      requests.reload();
    } catch (error) {
      setFormError(error?.message || "The procurement request could not be created.");
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

  const canCreate = isDiscom;
  const title = isDiscom
    ? "Power procurement"
    : role === "RENEWABLE_SUPPLIER"
      ? "Procurement marketplace"
      : "Procurement oversight";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow B · DISCOM ↔ supplier"
        icon={Handshake}
        title={title}
        description={
          isDiscom
            ? "Publish renewable power requirements, compare supplier offers and award contracts."
            : role === "RENEWABLE_SUPPLIER"
              ? "Verified supplier marketplace for renewable energy procurement opportunities."
              : "Awarded and closed procurement contracts with supplier provenance."
        }
        actions={
          <>
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} /> New requirement
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

      <NoteBanner title="Verified marketplace">
        {isDiscom
          ? "Only verified suppliers can view and quote on published requirements. Your organisation must be verified before publishing."
          : role === "RENEWABLE_SUPPLIER"
            ? "Your quotations are visible only to the publishing DISCOM. Contracts are awarded from the platform record."
            : "Figures below come from platform procurement records and are not official statistics."}
      </NoteBanner>

      {(isDiscom || isAdmin) && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["DRAFT", "OPEN", "QUOTATION_RECEIVED", "AWARDED"].map((key) => (
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
                placeholder="Search reference, location or requirement…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search procurement requests"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter procurement status"
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
              value={energyType}
              onChange={(event) => {
                setEnergyType(event.target.value);
                setPage(1);
              }}
              aria-label="Filter energy type"
            >
              <option value="All">All energy types</option>
              {ENERGY_TYPES.map((option) => (
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
          title="Procurement requests unavailable"
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
                        {item.title}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {titleCaseToken(item.energy_type)} ·{" "}
                        {formatNumber(item.quantity_mwh, 2)} MWh
                        {item.delivery_location
                          ? ` · ${item.delivery_location}`
                          : " · State-wide"}
                      </p>
                    </div>
                    <StatusBadge value={item.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Ceiling</p>
                      <p className="font-semibold text-slate-800">
                        {item.max_price_per_mwh
                          ? formatCurrency(item.max_price_per_mwh)
                          : "Open"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Quotes</p>
                      <p className="font-semibold text-slate-800">
                        {formatNumber(item.quotation_count, 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <p className="text-slate-500">Created</p>
                      <p className="font-semibold text-slate-800">
                        {formatDate(item.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] text-slate-400">
                      {item.discom?.name || "DISCOM"} ·{" "}
                      {item.awarded_at
                        ? `awarded ${formatDate(item.awarded_at)}`
                        : "not awarded"}
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
            label="requirements"
          />
        </>
      ) : (
        <EmptyState
          icon={Handshake}
          title="No procurement requirements"
          description={
            canCreate
              ? "Create a renewable power requirement and publish it to verified suppliers."
              : "Published requirements in your scope will appear here."
          }
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} /> Create requirement
              </Button>
            ) : null
          }
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New renewable procurement requirement"
        description="Saved as a draft. Publish when ready for supplier quotations."
        wide
      >
        <form className="space-y-3" onSubmit={submitCreate}>
          <Field label="Requirement title">
            <input
              className="field mt-1 h-9 w-full text-xs"
              required
              minLength={3}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Energy type">
              <select
                className="field mt-1 h-9 w-full text-xs"
                value={form.energy_type}
                onChange={(event) =>
                  setForm({ ...form, energy_type: event.target.value })
                }
              >
                {ENERGY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {titleCaseToken(type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity (MWh)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.quantity_mwh}
                onChange={(event) =>
                  setForm({ ...form, quantity_mwh: event.target.value })
                }
              />
            </Field>
            <Field label="Ceiling price / MWh (INR)">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="number"
                min="0"
                step="0.01"
                value={form.max_price_per_mwh}
                onChange={(event) =>
                  setForm({ ...form, max_price_per_mwh: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery start">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="date"
                value={form.delivery_start}
                onChange={(event) =>
                  setForm({ ...form, delivery_start: event.target.value })
                }
              />
            </Field>
            <Field label="Delivery end">
              <input
                className="field mt-1 h-9 w-full text-xs"
                type="date"
                value={form.delivery_end}
                onChange={(event) =>
                  setForm({ ...form, delivery_end: event.target.value })
                }
              />
            </Field>
          </div>
          <Field
            label="Delivery location / state"
            hint="Suppliers serving this state receive a notification when published."
          >
            <select
              className="field mt-1 h-9 w-full text-xs"
              value={form.delivery_location}
              onChange={(event) =>
                setForm({ ...form, delivery_location: event.target.value })
              }
            >
              <option value="">State-wide</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Requirement details">
            <textarea
              className="field mt-1 min-h-[90px] w-full text-xs"
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
              Save draft
            </Button>
          </div>
        </form>
      </Modal>

      <ProcurementDetail
        requestId={detailId}
        role={role}
        onClose={() => setDetailId(null)}
        onChanged={requests.reload}
      />
    </div>
  );
}
