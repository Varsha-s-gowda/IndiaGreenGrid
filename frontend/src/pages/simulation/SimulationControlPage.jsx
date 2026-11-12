import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  History,
  PlayCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sun,
  XCircle,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import Toggle from "../../components/ui/Toggle";
import SimulationTabs from "../../components/simulation/SimulationTabs";
import { useSolarTwin } from "../../context/SolarTwinContext";
import { getApiErrorMessage } from "../../lib/apiError";
import { dailyDateInput } from "../../lib/energy";
import {
  formatCapacity,
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { generateSimulation, getRuns } from "../../services/solarTwinService";

const STATUS_VARIANTS = {
  COMPLETED: "success",
  RUNNING: "info",
  PARTIAL: "warning",
  FAILED: "danger",
  PENDING: "neutral",
};

function addDays(dateString, days) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 1) - 1);
  return date.toISOString().slice(0, 10);
}

export default function SimulationControlPage() {
  const {
    runs,
    runsLoading,
    selectedRun,
    refresh,
    apartmentSummary,
  } = useSolarTwin();
  const navigate = useNavigate();

  const initialised = useRef(false);
  const pollTimer = useRef(null);

  const [form, setForm] = useState(() => ({
    capacity_kwp: 50,
    start_date: dailyDateInput(29),
    days: 30,
    seed: 360,
    regenerate: false,
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progressRun, setProgressRun] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialised.current || !runs.length) return;
    const latest = runs[0];
    setForm({
      capacity_kwp: latest.solar_capacity_kwp,
      start_date: latest.start_date,
      days: latest.days,
      seed: latest.random_seed,
      regenerate: false,
    });
    initialised.current = true;
  }, [runs]);

  useEffect(
    () => () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    },
    []
  );

  function stopPolling() {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer.current = window.setInterval(async () => {
      try {
        const data = await getRuns({ limit: 10 });
        const active = data.items?.find(
          (run) => run.status === "RUNNING" || run.status === "PARTIAL"
        );
        if (active) setProgressRun(active);
      } catch {
      }
    }, 1200);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const errors = {};
    const capacity = Number(form.capacity_kwp);
    const days = Number(form.days);
    const seed = Number(form.seed);

    if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 10000) {
      errors.capacity_kwp = "Enter a capacity between 0 and 10,000 kWp.";
    }
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      errors.days = "Enter a whole number of days between 1 and 366.";
    }
    if (!Number.isInteger(seed) || seed < 0) {
      errors.seed = "Enter a non-negative whole number seed.";
    }
    if (!form.start_date) {
      errors.start_date = "Choose the first day of the simulation.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;
    setConfirmOpen(true);
  }

  async function executeGeneration() {
    setConfirmOpen(false);
    setGenerating(true);
    setError("");
    setResult(null);
    setProgressRun(null);
    startPolling();

    try {
      const response = await generateSimulation({
        capacity_kwp: Number(form.capacity_kwp),
        start_date: form.start_date,
        days: Number(form.days),
        seed: Number(form.seed),
        regenerate: form.regenerate,
      });
      setResult(response);
      setProgressRun(response.run);
      await refresh();
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "The simulation could not be generated. Check the backend logs and try again."
        )
      );
    } finally {
      stopPolling();
      setGenerating(false);
    }
  }

  const matchingRun = runs.find(
    (run) =>
      Number(run.solar_capacity_kwp) === Number(form.capacity_kwp) &&
      run.start_date === form.start_date &&
      Number(run.days) === Number(form.days) &&
      Number(run.random_seed) === Number(form.seed)
  );

  const apartmentCount = apartmentSummary?.total_apartments;
  const projectedDays = Number(form.days) || 0;
  const projectedSolar = projectedDays * 24;
  const projectedMeter = apartmentCount ? apartmentCount * projectedDays * 24 : null;
  const projectedCommon = projectedDays * 4 * 24;
  const endDate = addDays(form.start_date, form.days);
  const statusRun = progressRun || result?.run || null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SolarTwin"
        icon={Settings2}
        title="Simulation control"
        description="Generate stored solar, apartment and common-area readings. This page is restricted to administrators."
        actions={
          <Badge variant="forest">
            <ShieldCheck size={11} /> Administrator only
          </Badge>
        }
      />
      <SimulationTabs />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="New simulation"
            description="The backend generates hourly readings for every day in the period using a deterministic seed."
            icon={PlayCircle}
          />
          <CardBody>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="field-label">Solar capacity (kWp)</span>
                  <input
                    type="number"
                    className={`field ${
                      fieldErrors.capacity_kwp ? "border-rose-300" : ""
                    }`}
                    min="0.1"
                    max="10000"
                    step="0.5"
                    value={form.capacity_kwp}
                    onChange={(event) =>
                      updateField("capacity_kwp", event.target.value)
                    }
                  />
                  {fieldErrors.capacity_kwp ? (
                    <p className="field-error">{fieldErrors.capacity_kwp}</p>
                  ) : (
                    <p className="field-hint">
                      Installed rooftop capacity used for every hourly reading.
                    </p>
                  )}
                </label>

                <label>
                  <span className="field-label">Start date</span>
                  <input
                    type="date"
                    className={`field ${
                      fieldErrors.start_date ? "border-rose-300" : ""
                    }`}
                    value={form.start_date}
                    onChange={(event) => updateField("start_date", event.target.value)}
                  />
                  {fieldErrors.start_date ? (
                    <p className="field-error">{fieldErrors.start_date}</p>
                  ) : (
                    <p className="field-hint">
                      Period ends {endDate ? formatUtcDate(endDate) : "—"}.
                    </p>
                  )}
                </label>

                <label>
                  <span className="field-label">Simulation length (days)</span>
                  <input
                    type="number"
                    className={`field ${fieldErrors.days ? "border-rose-300" : ""}`}
                    min="1"
                    max="366"
                    step="1"
                    value={form.days}
                    onChange={(event) => updateField("days", event.target.value)}
                  />
                  {fieldErrors.days ? (
                    <p className="field-error">{fieldErrors.days}</p>
                  ) : (
                    <p className="field-hint">The default SolarTwin window is 30 days.</p>
                  )}
                </label>

                <label>
                  <span className="field-label">Random seed</span>
                  <input
                    type="number"
                    className={`field ${fieldErrors.seed ? "border-rose-300" : ""}`}
                    min="0"
                    step="1"
                    value={form.seed}
                    onChange={(event) => updateField("seed", event.target.value)}
                  />
                  {fieldErrors.seed ? (
                    <p className="field-error">{fieldErrors.seed}</p>
                  ) : (
                    <p className="field-hint">
                      Identical settings and seed reproduce the same dataset.
                    </p>
                  )}
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                <Toggle
                  label="Regenerate matching stored readings"
                  description="When enabled, the backend replaces readings for the matching run. Historical runs are never deleted automatically."
                  checked={form.regenerate}
                  onChange={(value) => updateField("regenerate", value)}
                />
              </div>

              {matchingRun && (
                <div className="rounded-lg border border-forest-100 bg-forest-50/60 px-3.5 py-3">
                  <p className="text-xs font-medium text-forest-900">
                    {form.regenerate
                      ? `Readings for run #${matchingRun.id} will be replaced.`
                      : `An identical completed run (#${matchingRun.id}) already exists and will be reused.`}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-forest-800/80">
                    {form.regenerate
                      ? "Other simulation runs remain untouched. Only the matching run and its readings are regenerated."
                      : "Enable regeneration above if you want fresh readings instead of reusing the stored run."}
                  </p>
                </div>
              )}

              <div className="grid gap-2 rounded-lg border border-slate-200 p-3.5 text-[11px] text-slate-500 sm:grid-cols-3">
                <div>
                  <p className="font-semibold text-slate-700">Projected solar rows</p>
                  <p className="mt-0.5">{formatNumber(projectedSolar)} hourly readings</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Projected meter rows</p>
                  <p className="mt-0.5">
                    {projectedMeter
                      ? `${formatNumber(projectedMeter)} hourly readings`
                      : "Apartment inventory loading…"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Projected common rows</p>
                  <p className="mt-0.5">
                    {formatNumber(projectedCommon)} hourly readings
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={generating}>
                  <PlayCircle size={15} />
                  {generating ? "Generating simulation…" : "Generate simulation"}
                </Button>
                <p className="text-[11px] leading-5 text-slate-500">
                  A confirmation dialog appears before generation, and regeneration is
                  always explicit.
                </p>
              </div>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Generation status"
              description="Live status from /api/simulation/runs."
              icon={Clock3}
              action={
                statusRun ? (
                  <Badge variant={STATUS_VARIANTS[statusRun.status] || "neutral"} dot>
                    {statusRun.status}
                  </Badge>
                ) : (
                  <Badge variant="neutral" dot>
                    Idle
                  </Badge>
                )
              }
            />
            <CardBody>
              {error ? (
                <ErrorState
                  compact
                  title="Generation failed"
                  message={error}
                  onRetry={() => setConfirmOpen(true)}
                  retryLabel="Retry"
                />
              ) : statusRun ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Run #{statusRun.id} progress</span>
                      <span className="font-semibold text-slate-800">
                        {formatPercent(statusRun.progress_percentage)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          statusRun.status === "FAILED"
                            ? "bg-rose-500"
                            : statusRun.status === "COMPLETED"
                              ? "bg-emerald-500"
                              : "bg-forest-600"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, statusRun.progress_percentage || 0)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  {generating && !statusRun.progress_percentage && (
                    <p className="text-[11px] leading-5 text-slate-500">
                      Starting the run and creating hourly records…
                    </p>
                  )}

                  <div className="space-y-0">
                    <StatusRow label="Period">
                      {formatUtcDate(statusRun.start_date)} –{" "}
                      {formatUtcDate(statusRun.end_date)}
                    </StatusRow>
                    <StatusRow label="Capacity">
                      {formatCapacity(statusRun.solar_capacity_kwp)}
                    </StatusRow>
                    <StatusRow label="Solar records">
                      {formatNumber(statusRun.solar_records)} /{" "}
                      {formatNumber(statusRun.expected_records?.solar_records)}
                    </StatusRow>
                    <StatusRow label="Meter records">
                      {formatNumber(statusRun.meter_records)} /{" "}
                      {formatNumber(statusRun.expected_records?.meter_records)}
                    </StatusRow>
                    <StatusRow label="Common records">
                      {formatNumber(statusRun.common_records)} /{" "}
                      {formatNumber(statusRun.expected_records?.common_records)}
                    </StatusRow>
                  </div>

                  {result && (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
                      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                        {result.reused ? (
                          <RefreshCw size={13} />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        {result.reused
                          ? "Existing run reused"
                          : "Simulation generated"}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-emerald-800/80">
                        {result.message}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <RecordCount label="Solar" value={result.solar_created} />
                        <RecordCount label="Meter" value={result.meter_created} />
                        <RecordCount label="Common" value={result.common_created} />
                      </div>
                      <Link
                        to="/simulation"
                        className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-900 hover:gap-2"
                      >
                        Open energy overview
                        <ArrowRight size={12} />
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                  <Sun size={22} className="mx-auto text-slate-400" />
                  <p className="mt-2 text-xs font-medium text-slate-700">
                    No generation in progress
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    Configure the run and start a simulation to see live record counts
                    and completion status.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Safety rules"
              description="How generation preserves stored history."
              icon={ShieldCheck}
            />
            <CardBody className="space-y-2.5 text-[11px] leading-5 text-slate-600">
              <p className="flex items-start gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                Identical completed runs are reused unless regeneration is enabled.
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                Regeneration replaces only the explicitly matched run.
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                This page never deletes historical simulation runs.
              </p>
              <p className="flex items-start gap-2">
                <XCircle size={13} className="mt-0.5 shrink-0 text-slate-400" />
                No anonymous or resident user can call the generation endpoints.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Generation history"
          description={`${formatNumber(runs.length)} stored simulation run${runs.length === 1 ? "" : "s"}.`}
          icon={History}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              loading={runsLoading}
            >
              <RefreshCw size={13} />
              Refresh runs
            </Button>
          }
        />
        <CardBody className="px-0 pb-0">
          <div className="max-h-[28rem] overflow-auto scrollbar-thin">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Run</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Period</th>
                  <th className="px-3 py-2.5 font-semibold">Capacity</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Records</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Progress</th>
                  <th className="px-3 py-2.5 font-semibold">Created</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={`border-t border-slate-100 ${
                      selectedRun?.id === run.id ? "bg-forest-50/60" : ""
                    }`}
                  >
                    <td className="px-5 py-2.5 font-medium text-slate-800">
                      #{run.id}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={STATUS_VARIANTS[run.status] || "neutral"} dot>
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {formatUtcDate(run.start_date)} – {formatUtcDate(run.end_date)}
                      <span className="ml-1 text-slate-400">({run.days}d)</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {formatCapacity(run.solar_capacity_kwp)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      {formatNumber(
                        run.solar_records + run.meter_records + run.common_records
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-500">
                      {formatPercent(run.progress_percentage)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {formatDateTime(run.created_at)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/simulation?run=${run.id}`)}
                      >
                        <Database size={12} />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
                {!runs.length && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                      No simulation runs exist yet. Generate the first dataset above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={
          form.regenerate
            ? "Regenerate stored simulation data?"
            : matchingRun
              ? "Reuse the matching simulation?"
              : "Generate simulation data?"
        }
        description={
          form.regenerate
            ? "This will replace the readings of the matching run. Other historical runs will not be deleted."
            : "The backend will generate and store hourly solar, apartment and common-area readings for this configuration."
        }
        confirmLabel={form.regenerate ? "Regenerate data" : "Generate data"}
        tone={form.regenerate ? "danger" : "primary"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={executeGeneration}
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <ConfirmRow label="Capacity" value={formatCapacity(form.capacity_kwp)} />
          <ConfirmRow
            label="Period"
            value={`${formatUtcDate(form.start_date)} – ${formatUtcDate(endDate)}`}
          />
          <ConfirmRow label="Length" value={`${formatNumber(form.days)} days`} />
          <ConfirmRow label="Seed" value={formatNumber(form.seed)} />
          {matchingRun && (
            <ConfirmRow
              label="Matching run"
              value={`#${matchingRun.id} · ${matchingRun.status}`}
            />
          )}
        </div>
        {form.regenerate && matchingRun && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            Run #{matchingRun.id} currently contains {formatNumber(
              matchingRun.solar_records + matchingRun.meter_records + matchingRun.common_records
            )}{" "}
            stored readings. Regeneration replaces them with a fresh deterministic dataset.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function StatusRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-[11px] last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}

function RecordCount({ label, value }) {
  return (
    <div className="rounded-md bg-white/70 px-2 py-1.5">
      <p className="text-sm font-semibold text-emerald-900">{formatNumber(value)}</p>
      <p className="text-[9px] uppercase tracking-wide text-emerald-700">{label}</p>
    </div>
  );
}

function ConfirmRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-[11px] last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
