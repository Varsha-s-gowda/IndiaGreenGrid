import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  CheckCircle2,
  MapPin,
  Phone,
  PlusCircle,
  Recycle,
  RefreshCw,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import ChartCard, { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import { StatusBadge, SampleNotice } from "../../components/platform/DataBadges";
import ExportButton from "../../components/platform/ExportButton";
import Modal from "../../components/platform/Modal";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage, getValidationDetails } from "../../lib/apiError";
import { INDIAN_STATES, WASTE_CATEGORIES, titleCaseToken } from "../../lib/constants";
import { formatDate, formatNumber, formatPercent } from "../../lib/formatters";
import {
  createRecyclingTransaction,
  getCircularSummary,
  getRecyclers,
  getRecyclingTransaction,
  getRecyclingTransactions,
  updateRecyclingTransaction,
} from "../../services/platformService";

const STATUS_COLORS = {
  LOGGED: "#94a3b8",
  SCHEDULED: "#0ea5e9",
  IN_TRANSIT: "#6366f1",
  RECYCLED: "#2d744c",
  CANCELLED: "#f43f5e",
};

function LogTransactionModal({ open, onClose, onSaved, recyclers, defaultCategory }) {
  const { notify } = useNotifications();
  const [form, setForm] = useState({
    waste_category: defaultCategory || WASTE_CATEGORIES[0],
    recycler_id: "",
    quantity_kg: "",
    pickup_date: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [saving, setSaving] = useState(false);

  const eligibleRecyclers = useMemo(
    () =>
      (recyclers || []).filter((recycler) =>
        (recycler.accepted_categories || []).includes(form.waste_category)
      ),
    [recyclers, form.waste_category]
  );

  useEffect(() => {
    if (!open) return;
    setForm({
      waste_category: defaultCategory || WASTE_CATEGORIES[0],
      recycler_id: "",
      quantity_kg: "",
      pickup_date: "",
      notes: "",
    });
    setError("");
    setDetails([]);
  }, [open, defaultCategory]);

  useEffect(() => {
    if (!open) return;
    setForm((current) => {
      const stillEligible = eligibleRecyclers.some(
        (recycler) => String(recycler.id) === String(current.recycler_id)
      );
      if (stillEligible) return current;
      return {
        ...current,
        recycler_id: eligibleRecyclers[0] ? String(eligibleRecyclers[0].id) : "",
      };
    });
  }, [open, eligibleRecyclers]);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError("");
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setDetails([]);
    try {
      await createRecyclingTransaction({
        recycler_id: Number(form.recycler_id),
        waste_category: form.waste_category,
        quantity_kg: Number(form.quantity_kg),
        pickup_date: form.pickup_date || null,
        notes: form.notes,
      });
      notify({
        type: "success",
        title: "Recycling logged",
        message: "A traceability code was generated for this handover.",
        source: "Circular economy",
      });
      onSaved();
      onClose();
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to log the recycling transaction.")
      );
      setDetails(getValidationDetails(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log a recycling transaction"
      description="Record a handover of solar, battery or e-waste material to a listed recycler."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={handleSubmit}>
            Log transaction
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
            <p className="text-xs font-medium text-rose-800">{error}</p>
            {details.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-[11px] text-rose-700">
                {details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <label className="block">
          <span className="field-label">Waste category</span>
          <select
            className="field"
            value={form.waste_category}
            onChange={update("waste_category")}
            required
          >
            {WASTE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {titleCaseToken(category)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Recycler</span>
          <select
            className="field"
            value={form.recycler_id}
            onChange={update("recycler_id")}
            required
            disabled={!eligibleRecyclers.length}
          >
            <option value="">
              {eligibleRecyclers.length
                ? "Select a recycler"
                : "No recycler accepts this category"}
            </option>
            {eligibleRecyclers.map((recycler) => (
              <option key={recycler.id} value={recycler.id}>
                {recycler.name} — {recycler.city}, {recycler.state}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Quantity (kg)</span>
            <input
              className="field"
              type="number"
              min="0.01"
              step="0.01"
              value={form.quantity_kg}
              onChange={update("quantity_kg")}
              required
            />
          </label>
          <label className="block">
            <span className="field-label">Pickup date</span>
            <input
              className="field"
              type="date"
              value={form.pickup_date}
              onChange={update("pickup_date")}
            />
          </label>
        </div>
        <label className="block">
          <span className="field-label">Notes</span>
          <textarea
            className="field h-20 py-2"
            maxLength={2000}
            value={form.notes}
            onChange={update("notes")}
          />
        </label>
        <p className="text-[11px] leading-5 text-slate-500">
          The traceability code, material-recovery estimate and CO₂ estimate
          are generated by the backend. Status starts at LOGGED.
        </p>
      </form>
    </Modal>
  );
}

function StatusUpdateModal({ transaction, onClose, onSaved }) {
  const { notify } = useNotifications();
  const [status, setStatus] = useState("SCHEDULED");
  const [materialRecovered, setMaterialRecovered] = useState("");
  const [verification, setVerification] = useState("SAMPLE");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setStatus(transaction.status === "LOGGED" ? "SCHEDULED" : "RECYCLED");
    setMaterialRecovered(transaction.material_recovered_kg ?? "");
    setVerification(transaction.verification_status || "SAMPLE");
    setError("");
  }, [transaction]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { status, verification_status: verification };
      if (materialRecovered !== "" && materialRecovered !== null) {
        payload.material_recovered_kg = Number(materialRecovered);
      }
      await updateRecyclingTransaction(transaction.id, payload);
      notify({
        type: "success",
        title: "Status updated",
        message: `${transaction.traceability_code} is now ${status.toLowerCase()}.`,
        source: "Circular economy",
      });
      onSaved();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to update the status."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(transaction)}
      onClose={onClose}
      title="Advance recycling status"
      description={
        transaction
          ? `${transaction.traceability_code} · ${titleCaseToken(
              transaction.waste_category
            )} · ${formatNumber(transaction.quantity_kg, 1)} kg`
          : ""
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={handleSubmit}>
            Save status
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            {error}
          </p>
        )}
        <label className="block">
          <span className="field-label">New status</span>
          <select
            className="field"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["SCHEDULED", "IN_TRANSIT", "RECYCLED", "CANCELLED"].map((option) => (
              <option key={option} value={option}>
                {titleCaseToken(option)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Verified material recovered (kg)</span>
            <input
              className="field"
              type="number"
              min="0"
              max={transaction?.quantity_kg || undefined}
              step="0.01"
              value={materialRecovered}
              onChange={(event) => setMaterialRecovered(event.target.value)}
              placeholder="Leave blank if not yet measured"
            />
          </label>
          <label className="block">
            <span className="field-label">Verification status</span>
            <select
              className="field"
              value={verification}
              onChange={(event) => setVerification(event.target.value)}
            >
              {["SAMPLE", "VERIFIED", "REJECTED"].map((option) => (
                <option key={option} value={option}>
                  {titleCaseToken(option)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[11px] leading-5 text-slate-500">
          Only administrators can advance status, record measured material
          recovery or verify a transaction. Every change is appended to the
          traceability trail.
        </p>
      </form>
    </Modal>
  );
}

function TraceabilityModal({ transactionId, onClose }) {
  const { data, loading, error, reload } = useApiData(
    () => getRecyclingTransaction(transactionId),
    [transactionId],
    { enabled: Boolean(transactionId) }
  );

  return (
    <Modal
      open={Boolean(transactionId)}
      onClose={onClose}
      title="Traceability record"
      description={
        data
          ? `${data.traceability_code} · ${titleCaseToken(data.waste_category)} · ${formatNumber(data.quantity_kg, 1)} kg`
          : "Loading record…"
      }
      wide
    >
      {loading && !data ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      ) : error ? (
        <ErrorState compact title="Record unavailable" message={error} onRetry={reload} />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["Status", <StatusBadge key="status" value={data.status} />],
              ["Verification", <StatusBadge key="verification" value={data.verification_status} />],
              ["Recycler verified", data.recycler_verified ? "Yes" : "No"],
              ["Logged quantity", `${formatNumber(data.quantity_kg, 1)} kg`],
              ["Measured recovery", data.material_recovered_kg ? `${formatNumber(data.material_recovered_kg, 1)} kg` : "Not recorded"],
              ["Recovery rate", data.material_recovered_kg ? formatPercent(data.recovery_rate_pct, 1) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-500">{label}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-800">Append-only event trail</h3>
            <ol className="mt-2 space-y-2">
              {(data.events || []).map((event) => (
                <li key={event.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge value={event.status} />
                    <span className="text-[10px] text-slate-500">
                      {event.actor_role} · {formatDate(event.created_at)}
                    </span>
                  </div>
                  {event.note && <p className="mt-1 text-[11px] leading-5 text-slate-600">{event.note}</p>}
                </li>
              ))}
              {!(data.events || []).length && (
                <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-[11px] text-slate-500">
                  No events recorded yet.
                </li>
              )}
            </ol>
          </div>

          {data.notes && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
              {data.notes}
            </p>
          )}
          <p className="text-[11px] leading-5 text-slate-500">{data.traceability_note}</p>
        </div>
      ) : null}
    </Modal>
  );
}

export default function CircularPage() {
  const { isAdmin } = useAuth();
  const { notify } = useNotifications();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("All");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [txCategory, setTxCategory] = useState("All");
  const [txVerification, setTxVerification] = useState("All");
  const [logOpen, setLogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const summary = useApiData(getCircularSummary, []);
  const recyclers = useApiData(
    () => getRecyclers({ search, state, category }),
    [search, state, category]
  );
  const transactions = useApiData(
    () =>
      getRecyclingTransactions({
        status,
        waste_category: txCategory,
        verification_status: txVerification,
      }),
    [status, txCategory, txVerification]
  );

  const totals = summary.data?.totals || {};

  function refreshAll() {
    summary.reload();
    recyclers.reload();
    transactions.reload();
  }

  async function handleCancel(transaction) {
    setCancellingId(transaction.id);
    try {
      await updateRecyclingTransaction(transaction.id, { status: "CANCELLED" });
      notify({
        type: "success",
        title: "Transaction cancelled",
        message: `${transaction.traceability_code} was cancelled.`,
        source: "Circular economy",
      });
      refreshAll();
    } catch (requestError) {
      notify({
        type: "error",
        title: "Unable to cancel",
        message: getApiErrorMessage(requestError, "Please try again."),
        source: "Circular economy",
      });
    } finally {
      setCancellingId(null);
    }
  }

  const categoryChart = (summary.data?.by_category || [])
    .filter((item) => item.transactions > 0)
    .map((item) => ({
      name: titleCaseToken(item.category),
      quantity_kg: item.quantity_kg,
    }));

  const statusChart = (summary.data?.by_status || [])
    .filter((item) => item.transactions > 0)
    .map((item) => ({
      name: titleCaseToken(item.status),
      status: item.status,
      quantity_kg: item.quantity_kg,
      transactions: item.transactions,
    }));

  const recyclerRows = useMemo(() => recyclers.data?.items || [], [recyclers.data]);
  const transactionRows = transactions.data?.items || [];

  const exportRows = useMemo(
    () =>
      transactionRows.map((tx) => ({
        traceability_code: tx.traceability_code,
        waste_category: tx.waste_category,
        total_quantity_kg: tx.quantity_kg,
        material_recovered_kg: tx.material_recovered_kg,
        recovery_rate_pct: tx.recovery_rate_pct,
        status: tx.status,
        verification_status: tx.verification_status,
        recycler: tx.recycler_name,
        recycler_verified: tx.recycler_verified,
        city: tx.recycler_city,
        pickup_date: tx.pickup_date,
        created_at: tx.created_at,
      })),
    [transactionRows]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D6 · Opportunities"
        icon={Recycle}
        title="Circular economy tracker"
        description="Log solar panel, battery and e-waste handovers, trace them to a recycler and monitor recycling rates."
        actions={
          <>
            <ExportButton rows={exportRows} filename="recycling-transactions.csv" />
            <Button variant="outline" size="sm" onClick={refreshAll} loading={summary.loading}>
              <RefreshCw size={13} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <PlusCircle size={13} />
              Log recycling
            </Button>
          </>
        }
      />

      <SampleNotice title="Sample recycler directory and planning estimates">
        Recycler listings are bundled sample data. Verify CPCB/state authorisation
        before handover. Material recovery and CO₂ savings are planning estimates,
        not audited yields.
      </SampleNotice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total waste logged"
          value={`${formatNumber(totals.total_quantity_kg, 1)} kg`}
          detail={`${formatNumber(totals.verified_transactions, 0)} verified · ${formatNumber(totals.sample_transactions, 0)} sample`}
          icon={Recycle}
          loading={summary.loading}
        />
        <StatCard
          label="Recycled"
          value={`${formatNumber(totals.recycled_quantity_kg, 1)} kg`}
          detail={`${formatNumber(totals.recorded_material_recovery_kg, 1)} kg measured recovery`}
          icon={CheckCircle2}
          tone="emerald"
          loading={summary.loading}
        />
        <StatCard
          label="In progress"
          value={`${formatNumber(totals.in_progress_quantity_kg, 1)} kg`}
          detail="Logged, scheduled or in transit"
          icon={Truck}
          tone="sky"
          loading={summary.loading}
        />
        <StatCard
          label="Listed recyclers"
          value={formatNumber(totals.recycler_count, 0)}
          detail={`~${formatNumber(totals.estimated_co2_saved_kg, 0)} kg CO₂ saved (est.)`}
          icon={Building2}
          tone="amber"
          loading={summary.loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Quantity by waste category"
          description="Logged kilograms in your scope."
          icon={Recycle}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          empty={!categoryChart.length}
          emptyTitle="No waste logged yet"
          emptyDescription="Log a recycling transaction to populate this chart."
          height="h-64"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={50} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} unit=" kg" />
              <Tooltip content={<ChartTooltip unit=" kg" />} />
              <Bar dataKey="quantity_kg" name="Quantity" fill="#2d744c" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Transaction status mix"
          description="Status distribution by quantity."
          icon={Truck}
          loading={summary.loading}
          error={summary.error}
          onRetry={summary.reload}
          empty={!statusChart.length}
          emptyTitle="No transactions yet"
          emptyDescription="Transactions appear once logged and scheduled."
          height="h-64"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} unit=" kg" />
              <Tooltip content={<ChartTooltip unit=" kg" />} />
              <Bar dataKey="quantity_kg" name="Quantity" radius={[3, 3, 0, 0]}>
                {statusChart.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#94a3b8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <CardHeader
          title="Traceability log"
          description="Transactions visible to your account. Every status change and admin verification is appended to the traceability trail."
          icon={Recycle}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={transactions.data?.is_scoped ? "warning" : "forest"}>
                {transactions.data?.is_scoped ? "Your transactions" : "All transactions"}
              </Badge>
            </div>
          }
        />
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              className="field h-9 w-auto text-xs"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter transaction status"
            >
              <option value="All">All statuses</option>
              {(transactions.data?.statuses || []).map((item) => (
                <option key={item} value={item}>
                  {titleCaseToken(item)}
                </option>
              ))}
            </select>
            <select
              className="field h-9 w-auto text-xs"
              value={txCategory}
              onChange={(event) => setTxCategory(event.target.value)}
              aria-label="Filter waste category"
            >
              <option value="All">All categories</option>
              {(transactions.data?.categories || WASTE_CATEGORIES).map((item) => (
                <option key={item} value={item}>
                  {titleCaseToken(item)}
                </option>
              ))}
            </select>
            <select
              className="field h-9 w-auto text-xs"
              value={txVerification}
              onChange={(event) => setTxVerification(event.target.value)}
              aria-label="Filter verification status"
            >
              <option value="All">All verification</option>
              {(transactions.data?.verification_statuses || ["VERIFIED", "SAMPLE", "REJECTED"]).map((item) => (
                <option key={item} value={item}>
                  {titleCaseToken(item)}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500">
              {transactionRows.length} record{transactionRows.length === 1 ? "" : "s"}
            </span>
          </div>

          {transactions.error ? (
            <ErrorState compact title="Transactions unavailable" message={transactions.error} onRetry={transactions.reload} />
          ) : transactions.loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : transactionRows.length ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">Code</th>
                    <th className="pb-2 font-semibold">Category</th>
                    <th className="pb-2 text-right font-semibold">Quantity</th>
                    <th className="pb-2 text-right font-semibold">Recovery</th>
                    <th className="pb-2 font-semibold">Recycler</th>
                    <th className="pb-2 font-semibold">Pickup</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 font-semibold">Verification</th>
                    <th className="pb-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionRows.map((tx) => {
                    const canCancel =
                      tx.status !== "RECYCLED" && tx.status !== "CANCELLED";
                    return (
                      <tr key={tx.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2.5 font-mono text-[10px] text-slate-600">
                          {tx.traceability_code}
                        </td>
                        <td className="py-2.5 text-slate-700">{titleCaseToken(tx.waste_category)}</td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(tx.quantity_kg, 1)} kg
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {tx.material_recovered_kg
                            ? `${formatNumber(tx.material_recovered_kg, 1)} kg`
                            : "—"}
                        </td>
                        <td className="py-2.5">
                          <p className="text-slate-700">{tx.recycler_name || "—"}</p>
                          <p className="text-[10px] text-slate-400">{tx.recycler_city}</p>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {tx.pickup_date ? formatDate(tx.pickup_date) : "Not set"}
                        </td>
                        <td className="py-2.5"><StatusBadge value={tx.status} /></td>
                        <td className="py-2.5"><StatusBadge value={tx.verification_status} /></td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailId(tx.id)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-forest-200 hover:text-forest-700"
                            >
                              Trace
                            </button>
                            {isAdmin && tx.status !== "CANCELLED" && (
                              <button
                                type="button"
                                onClick={() => setStatusTarget(tx)}
                                className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-forest-200 hover:text-forest-700"
                              >
                                Update
                              </button>
                            )}
                            {canCancel && !isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleCancel(tx)}
                                disabled={cancellingId === tx.id}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[10px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                <Trash2 size={11} />
                                {cancellingId === tx.id ? "Cancelling…" : "Cancel"}
                              </button>
                            )}
                            {!isAdmin && !canCancel && (
                              <span className="text-[10px] text-slate-400">Closed</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Recycle size={26} className="mx-auto text-slate-300" />
              <p className="mt-2 text-xs font-medium text-slate-600">No recycling transactions yet</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Use “Log recycling” to record your first handover.
              </p>
            </div>
          )}
          {summary.data?.note && (
            <p className="mt-3 text-[11px] leading-5 text-slate-500">{summary.data.note}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Recycler directory"
          description="Filter by state, accepted material or search by name and city."
          icon={Building2}
          action={<Badge variant="info">Sample directory</Badge>}
        />
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="field h-9 pl-9 text-xs"
                placeholder="Search recycler, city or certification…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search recyclers"
              />
            </div>
            <select
              className="field h-9 w-auto text-xs"
              value={state}
              onChange={(event) => setState(event.target.value)}
              aria-label="Filter state"
            >
              <option value="All">All states</option>
              {(recyclers.data?.facets?.states || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select
              className="field h-9 w-auto text-xs"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filter accepted category"
            >
              <option value="All">All materials</option>
              {(recyclers.data?.facets?.categories || WASTE_CATEGORIES).map((item) => (
                <option key={item} value={item}>{titleCaseToken(item)}</option>
              ))}
            </select>
          </div>

          {recyclers.error ? (
            <ErrorState compact title="Recycler directory unavailable" message={recyclers.error} onRetry={recyclers.reload} />
          ) : recyclers.loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-40 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : recyclerRows.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recyclerRows.map((recycler) => (
                <div key={recycler.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-800">{recycler.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin size={11} />
                        {recycler.city}, {recycler.state}
                      </p>
                    </div>
                    {recycler.is_verified ? (
                      <Badge variant="success">Verified</Badge>
                    ) : (
                      <Badge variant="neutral">Unverified</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(recycler.accepted_categories || []).slice(0, 4).map((item) => (
                      <Badge key={item} variant="forest">{titleCaseToken(item)}</Badge>
                    ))}
                    {(recycler.accepted_categories || []).length > 4 && (
                      <Badge variant="neutral">+{recycler.accepted_categories.length - 4}</Badge>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                    <p>Capacity: {recycler.capacity_tonnes_per_month ? `${formatNumber(recycler.capacity_tonnes_per_month, 1)} t/month` : "Not specified"}</p>
                    {recycler.certification && <p>Certification: {recycler.certification}</p>}
                    {recycler.contact_phone && (
                      <p className="flex items-center gap-1"><Phone size={10} /> {recycler.contact_phone}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2.5 w-full"
                    onClick={() => setLogOpen(true)}
                  >
                    <PlusCircle size={12} />
                    Log with this recycler
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Building2 size={26} className="mx-auto text-slate-300" />
              <p className="mt-2 text-xs font-medium text-slate-600">No recyclers match these filters</p>
              <p className="mt-1 text-[11px] text-slate-500">Try a different state or material.</p>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">{recyclers.data?.disclaimer}</p>
        </CardBody>
      </Card>

      <LogTransactionModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSaved={refreshAll}
        recyclers={recyclerRows}
        defaultCategory={category !== "All" ? category : undefined}
      />
      <StatusUpdateModal
        transaction={statusTarget}
        onClose={() => setStatusTarget(null)}
        onSaved={refreshAll}
      />
      <TraceabilityModal
        transactionId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}
