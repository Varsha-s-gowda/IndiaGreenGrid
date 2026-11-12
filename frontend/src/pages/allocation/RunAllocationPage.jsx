import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  History,
  Info,
  Lock,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import Toggle from "../../components/ui/Toggle";
import AllocationPageHeader from "../../components/allocation/AllocationPageHeader";
import AllocationToolbar from "../../components/allocation/AllocationToolbar";
import ApartmentAllocationTable from "../../components/allocation/ApartmentAllocationTable";
import MethodBadge from "../../components/allocation/MethodBadge";
import NoAllocationState from "../../components/allocation/NoAllocationState";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import { getApiErrorMessage } from "../../lib/apiError";
import {
  METHOD_CAVEATS,
  METHOD_META,
  METHOD_ORDER,
  RUN_STATUS_LABELS,
  formatHash,
} from "../../lib/allocation";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { calculateAllocation } from "../../services/allocationService";

const MIN_POLICY_LENGTH = 10;

export default function RunAllocationPage() {
  const [searchParams] = useSearchParams();
  const {
    runId,
    selectedRun,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
    runsError,
    refresh,
  } = useAllocation();

  const initialMethod = METHOD_ORDER.includes(searchParams.get("method"))
    ? searchParams.get("method")
    : "EQUAL_SHARE";

  const [method, setMethod] = useState(initialMethod);
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const [policy, setPolicy] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedResult, setSavedResult] = useState(null);

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);

  const preview = useApiData(
    () =>
      calculateAllocation({
        simulation_run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
        method,
        save: false,
        allow_incomplete: allowIncomplete,
      }),
    [runId, dateFrom, dateTo, method, allowIncomplete],
    { enabled: ready }
  );

  const data = preview.data;
  const policyTooShort = allowIncomplete && policy.trim().length < MIN_POLICY_LENGTH;
  const needsPolicy = Boolean(data?.incomplete_data);
  const canSave =
    Boolean(data) && !saving && (!needsPolicy || allowIncomplete) && !policyTooShort;

  const warnings = data?.warnings || [];

  function resetScenario() {
    setAllowIncomplete(false);
    setPolicy("");
    setSaveError("");
    setSavedResult(null);
    preview.reload();
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const result = await calculateAllocation({
        simulation_run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
        method,
        save: true,
        allow_incomplete: allowIncomplete,
        incomplete_policy: allowIncomplete ? policy.trim() : undefined,
      });
      setSavedResult(result);
      setConfirmOpen(false);
    } catch (error) {
      setSaveError(getApiErrorMessage(error, "Unable to save this allocation run."));
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <AllocationPageHeader
          icon={PlayCircle}
          title="Run allocation"
          description="Preview a fair allocation from stored SolarTwin readings, then confirm the save explicitly."
        />
        <NoAllocationState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={PlayCircle}
        title="Run allocation"
        description="Preview the calculation first. Nothing is written to the database until you confirm the save, and saved runs are immutable snapshots."
        actions={
          <>
            <Badge variant="info" dot>
              <Lock size={11} /> Preview never persists
            </Badge>
            <Link to="/allocation/history">
              <Button variant="outline" size="sm">
                <History size={13} /> History
              </Button>
            </Link>
          </>
        }
      />

      {runsError && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="SolarTwin runs unavailable"
              message={runsError}
              onRetry={refresh}
            />
          </CardBody>
        </Card>
      )}

      {selectedRun && (
        <>
          <AllocationToolbar
            onRefresh={refresh}
            refreshing={preview.loading}
          />

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Choose an allocation method"
                description="All methods use the same capped water-filling engine and the same stored inputs. Only the weights change."
                icon={Sparkles}
              />
              <CardBody className="space-y-2">
                {METHOD_ORDER.map((key) => {
                  const meta = METHOD_META[key];
                  const active = method === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setMethod(key);
                        setSavedResult(null);
                        setSaveError("");
                      }}
                      aria-pressed={active}
                      className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                        active
                          ? "border-forest-300 bg-forest-50/70 ring-1 ring-forest-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: meta.color }}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-semibold text-slate-900">
                            {meta.label}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {active ? "Selected" : "Select"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {meta.description}
                      </p>
                      <p className="mt-1.5 rounded-md bg-white/70 px-2 py-1 font-mono text-[10px] text-slate-500">
                        {meta.formula}
                      </p>
                    </button>
                  );
                })}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Calculation settings"
                description="These settings do not change stored SolarTwin readings."
                icon={ShieldAlert}
              />
              <CardBody className="space-y-4">
                <Toggle
                  label="Allow incomplete readings"
                  description="Exclude incomplete hours instead of blocking the preview. Missing readings are never interpolated or fabricated."
                  checked={allowIncomplete}
                  onChange={(value) => {
                    setAllowIncomplete(value);
                    setSavedResult(null);
                    setSaveError("");
                  }}
                />

                <label className="block">
                  <span className="field-label text-xs">
                    Documented incomplete-data policy
                  </span>
                  <textarea
                    className="field min-h-[6rem] w-full py-2 text-xs"
                    value={policy}
                    maxLength={2000}
                    onChange={(event) => setPolicy(event.target.value)}
                    placeholder="Required before saving incomplete data: describe the administrator-approved treatment of missing hours."
                  />
                  <span
                    className={`mt-1 block text-[11px] ${
                      policyTooShort ? "text-rose-600" : "text-slate-400"
                    }`}
                  >
                    {policy.trim().length}/{MIN_POLICY_LENGTH} minimum characters
                    {policyTooShort ? " required for incomplete saves" : ""}
                  </span>
                </label>

                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
                  <p className="font-medium text-slate-700">Selected period</p>
                  <p className="mt-0.5">
                    {formatUtcDate(dateFrom)} – {formatUtcDate(dateTo)} · Run #
                    {selectedRun.id}
                  </p>
                  <p className="mt-1">
                    Algorithm version {data?.algorithm_version || "1.0.0"} · input hash{" "}
                    <span className="font-mono">{formatHash(data?.input_hash)}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={preview.reload}
                    loading={preview.loading}
                    disabled={!ready}
                  >
                    <RotateCcw size={13} /> Recalculate preview
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetScenario}>
                    Reset settings
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>

          {!ready && (
            <Card>
              <CardBody className="pt-5">
                <EmptyState
                  compact
                  title="Select a valid date range"
                  description="The allocation period must fall inside the selected SolarTwin run."
                />
              </CardBody>
            </Card>
          )}

          {ready && preview.loading && !data && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Card key={index}>
                  <CardBody className="space-y-2 pt-5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-3 w-36" />
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {ready && preview.error && (
            <Card>
              <CardBody className="pt-5">
                <ErrorState
                  title="Preview could not be calculated"
                  message={preview.error}
                  onRetry={preview.reload}
                  action={
                    !allowIncomplete ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setAllowIncomplete(true)}
                      >
                        <AlertTriangle size={13} />
                        Allow incomplete readings
                      </Button>
                    ) : undefined
                  }
                />
                <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
                  If the period has gaps, enable incomplete readings and document
                  the treatment policy. Allocation never invents missing values.
                </p>
              </CardBody>
            </Card>
          )}

          {savedResult && (
            <Card>
              <CardBody className="flex flex-wrap items-start justify-between gap-3 pt-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {savedResult.duplicate
                        ? `Identical run already saved (#${savedResult.run_id})`
                        : `Allocation run #${savedResult.run_id} saved`}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">
                      {savedResult.duplicate
                        ? "The backend recognised an identical method, period, algorithm version and input hash, so no duplicate row was created."
                        : "This immutable snapshot can now be inspected in history and compared with the other methods."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to="/allocation/history">
                    <Button variant="outline" size="sm">
                      View history <ArrowRight size={12} />
                    </Button>
                  </Link>
                  <Link to="/allocation/compare">
                    <Button variant="secondary" size="sm">
                      Compare methods
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          )}

          {saveError && (
            <Card>
              <CardBody className="pt-5">
                <ErrorState
                  title="Allocation was not saved"
                  message={saveError}
                  compact
                />
              </CardBody>
            </Card>
          )}

          {data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Available to apartments"
                  value={formatEnergy(data.totals.available_for_apartments_kwh)}
                  detail={`Common solar ${formatEnergy(data.totals.common_solar_consumption_kwh)} served first`}
                  icon={Database}
                  tone="sky"
                />
                <StatCard
                  label="Allocated by this method"
                  value={formatEnergy(data.totals.total_allocated_kwh)}
                  detail={`${formatPercent(data.totals.solar_utilization_percentage)} of generation used on site`}
                  icon={Sparkles}
                  tone="forest"
                />
                <StatCard
                  label="Average coverage"
                  value={formatPercent(data.totals.average_coverage_percentage)}
                  detail={`Jain index ${data.fairness.jain_index == null ? "N/A" : data.fairness.jain_index.toFixed(4)}`}
                  icon={FileCheck2}
                  tone="emerald"
                />
                <StatCard
                  label="Surplus / grid import"
                  value={formatEnergy(data.totals.surplus_kwh)}
                  detail={`${formatEnergy(data.totals.grid_import_kwh)} imported from the grid`}
                  icon={Save}
                  tone="amber"
                />
              </div>

              <Card>
                <CardHeader
                  title="Preview result"
                  description="Calculated in Python from actual PostgreSQL readings. This result has not been saved."
                  icon={Info}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <MethodBadge method={data.method} />
                      <Badge variant="info" dot>
                        Preview
                      </Badge>
                    </div>
                  }
                />
                <CardBody className="space-y-3">
                  <div className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                    <MiniFact
                      label="Apartments analysed"
                      value={formatNumber(data.apartments_analyzed)}
                    />
                    <MiniFact
                      label="Complete hours"
                      value={`${formatNumber(data.hour_count)}${data.expected_hour_count ? ` / ${formatNumber(data.expected_hour_count)}` : ""}`}
                    />
                    <MiniFact
                      label="Algorithm version"
                      value={data.algorithm_version}
                    />
                    <MiniFact
                      label="Input hash"
                      value={<span className="font-mono">{formatHash(data.input_hash)}</span>}
                    />
                  </div>

                  {data.incomplete_data && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Incomplete readings were excluded</p>
                        <p className="mt-0.5">
                          {formatNumber(data.missing_report?.incomplete_hours)} incomplete
                          and {formatNumber(data.missing_report?.missing_solar_hours)} missing
                          solar hours were excluded. Saving requires the documented policy
                          above.
                        </p>
                      </div>
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <ul className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                      {warnings.map((warning) => (
                        <li
                          key={warning}
                          className="flex items-start gap-2 text-[11px] leading-5 text-slate-600"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
                      Conservation check: total allocation never exceeds available
                      solar, no apartment exceeds its demand, and grid import is never
                      negative.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => setConfirmOpen(true)}
                      disabled={!canSave}
                    >
                      <Save size={13} />
                      Save allocation run
                    </Button>
                  </div>
                  {needsPolicy && !allowIncomplete && (
                    <p className="text-right text-[11px] text-rose-600">
                      Enable incomplete readings and document a policy before saving.
                    </p>
                  )}
                  {needsPolicy && allowIncomplete && policyTooShort && (
                    <p className="text-right text-[11px] text-rose-600">
                      The documented policy needs at least {MIN_POLICY_LENGTH} characters.
                    </p>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Apartment preview"
                  description={`${formatNumber(data.apartments.length)} flats in this preview. Nothing is persisted until you confirm the save.`}
                  icon={PlayCircle}
                />
                <CardBody className="px-0 pb-0">
                  <ApartmentAllocationTable
                    rows={data.apartments}
                    compact
                    linkToApartment
                    emptyTitle="No apartment rows in this preview"
                  />
                </CardBody>
              </Card>
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
              Saving the same method, simulation, date range, algorithm version and
              input hash twice returns the existing run with{" "}
              <span className="font-mono">duplicate=true</span>. Existing runs are never
              overwritten or deleted.
            </p>
            <Badge variant="neutral">
              No method is universally fairest
            </Badge>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Save this allocation run?"
        description="Saving creates an immutable audit snapshot with hourly records and apartment summaries. You cannot edit or delete it afterwards."
        confirmLabel="Save immutable run"
        loading={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSave}
      >
        {data && (
          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Method</span>
              <span className="font-medium text-slate-900">{data.method_label}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Period</span>
              <span className="font-medium text-slate-900">
                {formatUtcDate(data.date_from)} – {formatUtcDate(data.date_to)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Allocated solar</span>
              <span className="font-medium text-slate-900">
                {formatEnergy(data.totals.total_allocated_kwh, 2)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Status</span>
              <span className="font-medium text-slate-900">
                {data.incomplete_data
                  ? RUN_STATUS_LABELS.SAVED_WITH_GAPS
                  : RUN_STATUS_LABELS.SAVED}
              </span>
            </div>
            {data.incomplete_data && (
              <p className="border-t border-slate-200 pt-2 text-amber-700">
                Policy: {policy.trim()}
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Method caveats
        </p>
        <ul className="mt-2 space-y-1.5">
          {METHOD_CAVEATS.map((caveat) => (
            <li
              key={caveat}
              className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
              {caveat}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MiniFact({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-slate-800">{value}</p>
    </div>
  );
}
