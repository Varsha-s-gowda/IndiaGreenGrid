import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Target,
  Upload,
} from "lucide-react";
import ChartCard, { AXIS_TICK, ChartTooltip, GRID_STROKE } from "../../components/platform/ChartKit";
import { SampleNotice, StatusBadge } from "../../components/platform/DataBadges";
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
import { INDIAN_STATES } from "../../lib/constants";
import { formatNumber, formatPercent } from "../../lib/formatters";
import {
  createRpoTarget,
  getRpoOverview,
  getRpoTargetHistory,
  recordRpoCompliance,
  updateRpoTarget,
} from "../../services/platformService";

const ENTITY_TYPES = ["DISCOM", "INDUSTRY", "COMMERCIAL", "INSTITUTIONAL"];
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

function emptyTargetForm(user) {
  return {
    entity_type: user?.role === "INDUSTRY" ? "INDUSTRY" : "DISCOM",
    entity_name: user?.organization || "",
    entity_code: "",
    state: user?.state || "",
    year: 2025,
    obligated_energy_mwh: "",
    solar_target_pct: "",
    non_solar_target_pct: "",
    notes: "",
  };
}

function TargetFormModal({ open, onClose, onSaved, editing, user }) {
  const { notify } = useNotifications();
  const [form, setForm] = useState(emptyTargetForm(user));
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [saving, setSaving] = useState(false);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      if (error) setError("");
    };
  }

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        entity_type: editing.entity_type,
        entity_name: editing.entity_name,
        entity_code: editing.entity_code || "",
        state: editing.state,
        year: editing.year,
        obligated_energy_mwh: editing.obligated_energy_mwh,
        solar_target_pct: editing.solar_target_pct,
        non_solar_target_pct: editing.non_solar_target_pct,
        notes: editing.notes || "",
      });
    } else {
      setForm(emptyTargetForm(user));
    }
    setError("");
    setDetails([]);
  }, [open, editing, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setDetails([]);
    try {
      const payload = {
        entity_type: form.entity_type,
        entity_name: form.entity_name.trim(),
        entity_code: form.entity_code.trim(),
        state: form.state,
        year: Number(form.year),
        obligated_energy_mwh: Number(form.obligated_energy_mwh),
        solar_target_pct: Number(form.solar_target_pct),
        non_solar_target_pct: Number(form.non_solar_target_pct),
        notes: form.notes,
      };
      if (editing) {
        const { year, ...updates } = payload;
        await updateRpoTarget(editing.id, updates);
        notify({
          type: "success",
          title: "RPO target updated",
          message: `${payload.entity_name} (${editing.year}) was updated.`,
          source: "RPO tracker",
        });
      } else {
        await createRpoTarget(payload);
        notify({
          type: "success",
          title: "RPO target created",
          message: `${payload.entity_name} (${payload.year}) is now tracked.`,
          source: "RPO tracker",
        });
      }
      onSaved();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to save the RPO target."));
      setDetails(getValidationDetails(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit RPO target" : "Create RPO target"}
      description="Obligated energy and target percentages are stored per entity and year."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={handleSubmit}>
            {editing ? "Save changes" : "Create target"}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Entity type</span>
            <select className="field" value={form.entity_type} onChange={update("entity_type")} disabled={Boolean(editing)}>
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Year</span>
            <select className="field" value={form.year} onChange={update("year")} disabled={Boolean(editing)}>
              {YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="field-label">Entity name</span>
          <input className="field" value={form.entity_name} onChange={update("entity_name")} required minLength={2} />
        </label>
        <label className="block">
          <span className="field-label">Entity / consumer code (optional)</span>
          <input
            className="field"
            value={form.entity_code}
            onChange={update("entity_code")}
            maxLength={80}
            placeholder="e.g. JVVNL-SAMPLE"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">State</span>
            <select className="field" value={form.state} onChange={update("state")} required>
              <option value="">Select state</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Obligated energy (MWh)</span>
            <input className="field" type="number" min="0.01" step="0.01" value={form.obligated_energy_mwh} onChange={update("obligated_energy_mwh")} required />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Solar target (%)</span>
            <input className="field" type="number" min="0" max="100" step="0.01" value={form.solar_target_pct} onChange={update("solar_target_pct")} required />
          </label>
          <label className="block">
            <span className="field-label">Non-solar target (%)</span>
            <input className="field" type="number" min="0" max="100" step="0.01" value={form.non_solar_target_pct} onChange={update("non_solar_target_pct")} required />
          </label>
        </div>
        <label className="block">
          <span className="field-label">Notes</span>
          <textarea className="field h-20 py-2" maxLength={2000} value={form.notes} onChange={update("notes")} />
        </label>
        <p className="text-[11px] leading-5 text-slate-500">
          Required renewable energy is calculated by the backend from obligated
          energy × combined target percentage. The client never performs this
          calculation.
        </p>
      </form>
    </Modal>
  );
}

function ComplianceModal({ target, onClose, onSaved }) {
  const { notify } = useNotifications();
  const [form, setForm] = useState({
    actual_solar_mwh: "",
    actual_non_solar_mwh: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    try {
      await recordRpoCompliance(target.id, {
        actual_solar_mwh: Number(form.actual_solar_mwh),
        actual_non_solar_mwh: Number(form.actual_non_solar_mwh),
        notes: form.notes,
      });
      notify({
        type: "success",
        title: "Compliance recorded",
        message: `Actual renewable consumption saved for ${target.entity_name}.`,
        source: "RPO tracker",
      });
      onSaved();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to record compliance."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title="Record RPO compliance"
      description={
        target
          ? `${target.entity_name} · ${target.state} · ${target.year}`
          : ""
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSubmit}>Save compliance</Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            {error}
          </p>
        )}
        {target && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
            Required renewable energy: <strong>{formatNumber(target.required_mwh, 2)} MWh</strong>{" "}
            · Combined target {formatPercent(target.total_target_pct, 2)}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Actual solar (MWh)</span>
            <input className="field" type="number" min="0" step="0.01" value={form.actual_solar_mwh} onChange={update("actual_solar_mwh")} required />
          </label>
          <label className="block">
            <span className="field-label">Actual non-solar (MWh)</span>
            <input className="field" type="number" min="0" step="0.01" value={form.actual_non_solar_mwh} onChange={update("actual_non_solar_mwh")} required />
          </label>
        </div>
        <label className="block">
          <span className="field-label">Notes</span>
          <textarea className="field h-20 py-2" maxLength={2000} value={form.notes} onChange={update("notes")} />
        </label>
        <p className="text-[11px] leading-5 text-slate-500">
          Compliance percentage and shortfall are computed by the backend.
        </p>
      </form>
    </Modal>
  );
}

function HistoryModal({ target, onClose }) {
  const [state, setState] = useState({ loading: false, data: null, error: "" });

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setState({ loading: true, data: null, error: "" });
    getRpoTargetHistory(target.target_id)
      .then((payload) => {
        if (!cancelled) setState({ loading: false, data: payload, error: "" });
      })
      .catch((requestError) => {
        if (!cancelled) {
          setState({
            loading: false,
            data: null,
            error: getApiErrorMessage(
              requestError,
              "Unable to load the compliance history."
            ),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title="Compliance submission history"
      description={
        target
          ? `${target.entity_name}${target.entity_code ? ` · ${target.entity_code}` : ""} · ${target.year}`
          : ""
      }
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {state.loading && (
        <p className="py-6 text-center text-xs text-slate-500">
          Loading submissions…
        </p>
      )}
      {state.error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
          {state.error}
        </p>
      )}
      {state.data && (
        <div className="space-y-3">
          <p className="text-[11px] leading-5 text-slate-500">
            {state.data.note}
          </p>
          {state.data.items.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
              No compliance submissions recorded yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {state.data.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-700">
                      {new Date(item.recorded_at).toLocaleString()}
                    </span>
                    <StatusBadge value={item.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Solar {formatNumber(item.actual_solar_mwh, 2)} MWh ·
                    non-solar {formatNumber(item.actual_non_solar_mwh, 2)} MWh ·
                    compliance {formatPercent(item.compliance_pct, 2)}
                  </p>
                  {item.notes && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      {item.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function RpoPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiData(getRpoOverview, []);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [complianceTarget, setComplianceTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);

  const filteredTargets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.targets || []).filter((target) => {
      const statusMatch = statusFilter === "ALL" || target.status === statusFilter;
      const searchMatch =
        !term ||
        target.entity_name.toLowerCase().includes(term) ||
        target.state.toLowerCase().includes(term);
      return statusMatch && searchMatch;
    });
  }, [data, statusFilter, search]);

  const exportRows = useMemo(
    () =>
      (data?.targets || []).map((target) => ({
        entity: target.entity_name,
        entity_type: target.entity_type,
        state: target.state,
        year: target.year,
        required_mwh: target.required_mwh,
        actual_mwh: target.actual_total_mwh,
        compliance_pct: target.compliance_pct,
        shortfall_mwh: target.shortfall_mwh,
        status: target.status,
      })),
    [data]
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="D2 · National intelligence" icon={Target} title="RPO compliance tracker" />
        <ErrorState title="RPO data unavailable" message={error} onRetry={reload} />
      </div>
    );
  }

  const summary = data?.summary || {};

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="D2 · National intelligence"
        icon={Target}
        title="Renewable purchase obligation tracker"
        description={data?.scope_note || "Track 2025–2030 RPO targets, record actual renewable consumption and monitor compliance."}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload} loading={loading}>
              <RefreshCw size={13} />
              Refresh
            </Button>
            {data?.can_manage && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <PlusCircle size={13} />
                New target
              </Button>
            )}
          </>
        }
      />

      {data?.verification?.requires_approval && (
        <SampleNotice
          title="Organisational account pending verification"
          tone="warning"
        >
          Your {user?.role?.replaceAll("_", " ").toLowerCase()} account can read
          national modules now. Creating RPO targets and recording compliance
          unlocks after an administrator verifies the organisation.
        </SampleNotice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Overall compliance"
          value={
            summary.overall_compliance_pct === null ||
            summary.overall_compliance_pct === undefined
              ? "Not recorded"
              : formatPercent(summary.overall_compliance_pct, 2)
          }
          detail={`${summary.target_count || 0} targets in scope`}
          icon={Target}
          tone="emerald"
          loading={loading}
        />
        <StatCard
          label="Recorded shortfall"
          value={`${formatNumber(summary.total_shortfall_mwh, 0)} MWh`}
          detail="Across recorded years"
          icon={AlertTriangle}
          tone="amber"
          loading={loading}
        />
        <StatCard
          label="Compliant entities"
          value={formatNumber(summary.compliant_count, 0)}
          detail={`${formatNumber(summary.at_risk_count, 0)} at risk · ${formatNumber(summary.non_compliant_count, 0)} non-compliant`}
          icon={CheckCircle2}
          tone="sky"
          loading={loading}
        />
        <StatCard
          label="Not yet recorded"
          value={formatNumber(summary.not_recorded_count, 0)}
          detail="Targets awaiting actual consumption"
          icon={Upload}
          tone="slate"
          loading={loading}
        />
      </div>

      <ChartCard
        title="2025–2030 yearly tracker"
        description="Required versus recorded renewable energy and resulting compliance."
        icon={Target}
        loading={loading}
        empty={!data?.yearly_tracker?.length}
        height="h-80"
        footer="Compliance is calculated by the backend. Years without records are shown as not recorded, not as zero compliance."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data?.yearly_tracker || []} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
            <YAxis yAxisId="left" tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} />
            <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} unit="%" domain={[0, 120]} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar yAxisId="left" dataKey="required_mwh" name="Required (MWh)" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="actual_mwh" name="Actual (MWh)" fill="#2d744c" radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="compliance_pct" name="Compliance (%)" stroke="#d97706" strokeWidth={2} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {data?.regulatory_basis && (
        <Card>
          <CardHeader
            title="Regulatory basis and documented assumptions"
            description={data.regulatory_basis.framework}
            icon={BookOpen}
            action={
              <Badge variant="warning">
                {data.regulatory_basis.verification_status === "REFERENCE_ONLY"
                  ? "Reference only"
                  : data.regulatory_basis.verification_status}
              </Badge>
            }
          />
          <CardBody>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 text-[11px] leading-5 text-slate-600">
                <p>
                  <span className="font-semibold text-slate-700">
                    Issuing authority:
                  </span>{" "}
                  {data.regulatory_basis.issuing_authority}
                </p>
                <p>{data.regulatory_basis.trajectory_note}</p>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  {data.regulatory_basis.disclaimer}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Calculation assumptions
                </p>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] leading-5 text-slate-600">
                  {(data.regulatory_basis.assumptions || []).map(
                    (assumption) => (
                      <li key={assumption}>{assumption}</li>
                    )
                  )}
                </ul>
                {data.regulatory_basis.source_url && (
                  <a
                    href={data.regulatory_basis.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[11px] font-medium text-forest-700 hover:underline"
                  >
                    {data.regulatory_basis.source_name} ↗
                  </a>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="RPO targets"
          description="Filter targets by status or search by entity and state."
          icon={Target}
          action={<Badge variant={data?.is_scoped ? "warning" : "forest"}>{data?.is_scoped ? "Scoped to you" : "All entities"}</Badge>}
        />
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              className="field h-9 max-w-xs text-xs"
              placeholder="Search entity or state…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search RPO targets"
            />
            <select
              className="field h-9 w-auto text-xs"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
            >
              <option value="ALL">All statuses</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="AT_RISK">At risk</option>
              <option value="NON_COMPLIANT">Non-compliant</option>
              <option value="NOT_RECORDED">Not recorded</option>
            </select>
            <span className="text-[11px] text-slate-500">{filteredTargets.length} shown</span>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                  <th className="pb-2 font-semibold">Entity</th>
                  <th className="pb-2 font-semibold">State</th>
                  <th className="pb-2 text-right font-semibold">Year</th>
                  <th className="pb-2 text-right font-semibold">Required (MWh)</th>
                  <th className="pb-2 text-right font-semibold">Actual (MWh)</th>
                  <th className="pb-2 text-right font-semibold">Compliance</th>
                  <th className="pb-2 text-right font-semibold">Shortfall</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTargets.map((target) => (
                  <tr key={target.target_id} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2.5">
                      <p className="font-medium text-slate-800">{target.entity_name}</p>
                      <p className="text-[10px] text-slate-400">
                        {target.entity_type}
                        {target.entity_code ? ` · ${target.entity_code}` : ""}
                      </p>
                    </td>
                    <td className="py-2.5 text-slate-600">{target.state}</td>
                    <td className="py-2.5 text-right text-slate-600">{target.year}</td>
                    <td className="py-2.5 text-right text-slate-600">{formatNumber(target.required_mwh, 0)}</td>
                    <td className="py-2.5 text-right text-slate-600">{formatNumber(target.actual_total_mwh, 0)}</td>
                    <td className="py-2.5 text-right font-medium text-slate-800">
                      {target.compliance_pct === null ? "—" : formatPercent(target.compliance_pct, 2)}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">{formatNumber(target.shortfall_mwh, 0)}</td>
                    <td className="py-2.5"><StatusBadge value={target.status} /></td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setHistoryTarget(target)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-forest-200 hover:text-forest-700"
                        >
                          History
                        </button>
                        {data?.can_manage ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setComplianceTarget(target)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition hover:border-forest-200 hover:text-forest-700"
                            >
                              Record
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(target);
                                setFormOpen(true);
                              }}
                              className="rounded-md border border-slate-200 p-1 text-slate-500 transition hover:border-forest-200 hover:text-forest-700"
                              aria-label={`Edit ${target.entity_name}`}
                            >
                              <Pencil size={12} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            Read only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredTargets.length && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-xs text-slate-500">
                      No RPO targets match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Targets are scope-filtered by the backend: policymakers and administrators
            see all entities, while DISCOM and industry accounts see their own targets.
          </p>
          {exportRows.length > 0 && (
            <div className="mt-2">
              <Badge variant="neutral">{exportRows.length} targets ready to export</Badge>
            </div>
          )}
        </CardBody>
      </Card>

      <TargetFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={reload}
        editing={editing}
        user={user}
      />
      <ComplianceModal
        target={complianceTarget}
        onClose={() => setComplianceTarget(null)}
        onSaved={reload}
      />
      <HistoryModal
        target={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}
