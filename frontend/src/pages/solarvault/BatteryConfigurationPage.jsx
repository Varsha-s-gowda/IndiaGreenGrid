import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Info,
  Lock,
  PlayCircle,
  RotateCcw,
  Save,
  Settings2,
  Zap,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import Toggle from "../../components/ui/Toggle";
import SolarVaultDisclaimer from "../../components/solarvault/SolarVaultDisclaimer";
import SolarVaultInfoRow from "../../components/solarvault/SolarVaultInfoRow";
import SolarVaultPageHeader from "../../components/solarvault/SolarVaultPageHeader";
import { useNotifications } from "../../context/NotificationContext";
import { useSolarVault } from "../../context/SolarVaultContext";
import { getApiErrorMessage, getValidationDetails } from "../../lib/apiError";
import {
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import {
  runBatterySimulation,
  updateBatteryConfiguration,
} from "../../services/solarvaultService";

const NUMERIC_FIELDS = [
  "capacity_kwh",
  "max_charge_kw",
  "max_discharge_kw",
  "charge_efficiency_pct",
  "discharge_efficiency_pct",
  "initial_soc_pct",
  "min_soc_pct",
  "max_soc_pct",
];

function toForm(configuration) {
  if (!configuration) return null;
  const form = {
    name: configuration.name,
    notes: configuration.notes || "",
  };
  for (const key of NUMERIC_FIELDS) {
    form[key] =
      configuration[key] === null || configuration[key] === undefined
        ? ""
        : String(configuration[key]);
  }
  return form;
}

function numberValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildChanges(form, initial) {
  if (!form || !initial) return {};
  const changes = {};
  const name = (form.name || "").trim();
  if (name !== (initial.name || "").trim()) changes.name = name;
  const notes = (form.notes || "").trim();
  if (notes !== (initial.notes || "").trim()) changes.notes = notes || null;

  for (const key of NUMERIC_FIELDS) {
    const next = numberValue(form[key]);
    const previous =
      initial[key] === null || initial[key] === undefined
        ? null
        : Number(initial[key]);
    if (next === null) continue;
    if (previous === null || Math.abs(next - previous) > 1e-9) {
      changes[key] = next;
    }
  }
  return changes;
}

function validateForm(form) {
  const problems = [];
  const name = (form?.name || "").trim();
  if (name.length < 2) problems.push("Plan name must contain at least 2 characters.");

  const values = {};
  for (const key of NUMERIC_FIELDS) {
    const value = numberValue(form[key]);
    if (value === null) {
      problems.push("Every numeric field is required.");
      return problems;
    }
    values[key] = value;
  }

  if (values.capacity_kwh < 0) problems.push("Capacity cannot be negative.");
  if (values.max_charge_kw < 0 || values.max_discharge_kw < 0) {
    problems.push("Charge and discharge power cannot be negative.");
  }
  if (
    values.charge_efficiency_pct <= 0 ||
    values.charge_efficiency_pct > 100 ||
    values.discharge_efficiency_pct <= 0 ||
    values.discharge_efficiency_pct > 100
  ) {
    problems.push("Efficiencies must be greater than 0 and at most 100 %.");
  }
  if (
    values.min_soc_pct < 0 ||
    values.min_soc_pct > 100 ||
    values.max_soc_pct < 0 ||
    values.max_soc_pct > 100 ||
    values.initial_soc_pct < 0 ||
    values.initial_soc_pct > 100
  ) {
    problems.push("State-of-charge values must be between 0 and 100 %.");
  }
  if (values.min_soc_pct > values.max_soc_pct) {
    problems.push("Minimum SOC cannot exceed maximum SOC.");
  }
  if (
    values.initial_soc_pct < values.min_soc_pct ||
    values.initial_soc_pct > values.max_soc_pct
  ) {
    problems.push("Initial SOC must lie between the minimum and maximum SOC.");
  }
  return problems;
}

function NumberField({ label, hint, value, onChange, step = "any", min }) {
  return (
    <Input
      label={label}
      hint={hint}
      type="number"
      step={step}
      min={min}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export default function BatteryConfigurationPage() {
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const {
    configuration,
    configurationLoading,
    configurationError,
    reloadConfiguration,
    runOptions,
    selectedRunId,
    selectRun,
    simulation,
    refresh,
    disclaimer,
    limitations,
  } = useSolarVault();

  const initial = useMemo(() => toForm(configuration), [configuration]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveDetails, setSaveDetails] = useState([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [publish, setPublish] = useState(true);
  const [runNotes, setRunNotes] = useState("");

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(initial);
    setSaveError("");
    setSaveDetails([]);
  }

  async function handleSave() {
    const problems = validateForm(form);
    if (problems.length) {
      setSaveError(problems.join(" "));
      setSaveDetails([]);
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveDetails([]);
    try {
      const changes = buildChanges(form, configuration);
      if (!Object.keys(changes).length) {
        notify({
          type: "info",
          title: "No configuration changes",
          message: "Every field matches the active battery configuration.",
          source: "SolarVault",
        });
        return;
      }
      const result = await updateBatteryConfiguration(changes);
      await reloadConfiguration();
      await refresh();
      notify({
        type: "success",
        title: "Battery configuration saved",
        message: `Version ${result.configuration.id} is now active. Previous simulations keep the parameters they were calculated with.`,
        source: "SolarVault",
      });
    } catch (requestError) {
      setSaveError(
        getApiErrorMessage(requestError, "Unable to save the configuration.")
      );
      setSaveDetails(getValidationDetails(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!selectedRunId) return;
    setRunning(true);
    setRunError("");
    try {
      const result = await runBatterySimulation({
        simulation_run_id: selectedRunId,
        publish,
        notes: runNotes.trim() || undefined,
      });
      await refresh();
      notify({
        type: "success",
        title: result.duplicate
          ? "Existing simulation reused"
          : result.published
            ? "Simulation published"
            : "Draft simulation saved",
        message: `${result.simulation.simulation_code}: ${formatEnergy(
          result.simulation.total_charged_kwh,
          2
        )} charged, ${formatEnergy(
          result.simulation.total_discharged_kwh,
          2
        )} discharged, ${formatEnergy(
          result.simulation.grid_reduction_kwh,
          2
        )} grid import avoided.`,
        source: "SolarVault",
      });
      navigate(`/solarvault?simulation=${result.simulation.id}`);
    } catch (requestError) {
      setRunError(
        getApiErrorMessage(requestError, "Unable to run the simulation.")
      );
    } finally {
      setRunning(false);
    }
  }

  if (configurationLoading) {
    return (
      <div className="space-y-6">
        <SolarVaultPageHeader
          icon={Settings2}
          title="Battery configuration"
          description="Administrator-controlled battery parameters. Saving appends a new version; historical simulations remain reproducible."
        />
        <Card>
          <CardBody className="space-y-3 pt-5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (configurationError || !form) {
    return (
      <div className="space-y-6">
        <SolarVaultPageHeader
          icon={Settings2}
          title="Battery configuration"
          description="Administrator-controlled battery parameters."
        />
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Configuration unavailable"
              message={
                configurationError || "No SolarVault configuration exists."
              }
              onRetry={reloadConfiguration}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  const capacity = numberValue(form.capacity_kwh);
  const disabled = capacity !== null && capacity <= 0;

  return (
    <div className="space-y-6">
      <SolarVaultPageHeader
        icon={Settings2}
        title="Battery configuration"
        description="Only administrators can edit these battery inputs. Saving appends a new configuration version, so every stored simulation remains tied to the parameters it was calculated with."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="forest" dot>
              <Lock size={11} />
              Administrator only
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={resetForm}
              disabled={saving || running}
            >
              <RotateCcw size={13} />
              Reset
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              <Save size={13} />
              Save version
            </Button>
          </div>
        }
      />

      {saveError && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Configuration was not saved"
              message={
                saveDetails.length
                  ? `${saveError} ${saveDetails.join(" ")}`
                  : saveError
              }
              compact
            />
          </CardBody>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Capacity and power limits"
              description="These limits bound how much surplus solar can be stored and how quickly stored energy can serve unmet demand in any one hour."
              icon={BatteryCharging}
            />
            <CardBody className="grid gap-4 pt-1 md:grid-cols-2">
              <Input
                label="Plan name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
              />
              <NumberField
                label="Battery capacity (kWh)"
                value={form.capacity_kwh}
                onChange={(value) => setField("capacity_kwh", value)}
                step="0.001"
                min="0"
                hint="Set 0 to disable storage and reproduce the no-battery baseline."
              />
              <NumberField
                label="Maximum charge power (kW)"
                value={form.max_charge_kw}
                onChange={(value) => setField("max_charge_kw", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Maximum discharge power (kW)"
                value={form.max_discharge_kw}
                onChange={(value) => setField("max_discharge_kw", value)}
                step="0.001"
                min="0"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Efficiencies and state of charge"
              description="Efficiencies are planning values. The engine converts drawn solar into stored energy and stored energy into delivered energy with these percentages."
              icon={Zap}
            />
            <CardBody className="grid gap-4 pt-1 md:grid-cols-2 xl:grid-cols-3">
              <NumberField
                label="Charge efficiency (%)"
                value={form.charge_efficiency_pct}
                onChange={(value) =>
                  setField("charge_efficiency_pct", value)
                }
                step="0.001"
                min="0"
                hint="Stored gain = charge input × efficiency."
              />
              <NumberField
                label="Discharge efficiency (%)"
                value={form.discharge_efficiency_pct}
                onChange={(value) =>
                  setField("discharge_efficiency_pct", value)
                }
                step="0.001"
                min="0"
                hint="Delivered = stored used × efficiency."
              />
              <NumberField
                label="Initial SOC (%)"
                value={form.initial_soc_pct}
                onChange={(value) => setField("initial_soc_pct", value)}
                step="0.001"
                min="0"
                hint="Must lie between the reserve and maximum SOC."
              />
              <NumberField
                label="Minimum reserve SOC (%)"
                value={form.min_soc_pct}
                onChange={(value) => setField("min_soc_pct", value)}
                step="0.001"
                min="0"
                hint="Stored energy is never discharged below this level."
              />
              <NumberField
                label="Maximum SOC (%)"
                value={form.max_soc_pct}
                onChange={(value) => setField("max_soc_pct", value)}
                step="0.001"
                min="0"
                hint="Charging stops at this level."
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-[11px] leading-5 text-slate-600">
                Usable capacity = capacity × (maximum SOC − minimum SOC) /
                100. Calculated by the backend after saving.
              </div>
            </CardBody>
          </Card>

          {disabled && (
            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sky-900">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-[11px] leading-5">
                Capacity is zero, so the simulation will reproduce the
                no-battery baseline. To make the configuration valid, also set
                initial SOC and minimum SOC to 0.
              </p>
            </div>
          )}

          <Card>
            <CardHeader
              title="Notes"
              description="Optional context stored with this configuration version."
              icon={Info}
            />
            <CardBody className="pt-1">
              <label>
                <span className="field-label text-xs">
                  Configuration notes
                </span>
                <textarea
                  className="field min-h-[90px] text-xs"
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  placeholder="Battery model, inverter limits, quotation reference, commissioning date…"
                />
              </label>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Run an hourly simulation"
              description="Reads stored generation and demand from the selected completed SolarTwin run, then saves an immutable snapshot."
              icon={PlayCircle}
            />
            <CardBody className="space-y-4 pt-1">
              <label>
                <span className="field-label text-xs">SolarTwin run</span>
                <select
                  className="field h-10 text-xs"
                  value={selectedRunId || ""}
                  onChange={(event) =>
                    selectRun(
                      event.target.value ? Number(event.target.value) : null
                    )
                  }
                  disabled={!runOptions.length || running}
                >
                  {!runOptions.length && (
                    <option value="">No completed run</option>
                  )}
                  {runOptions.map((run) => (
                    <option key={run.id} value={run.id}>
                      Run #{run.id} · {formatUtcDate(run.start_date)} to{" "}
                      {formatUtcDate(run.end_date)} · {run.days} days
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <Toggle
                  checked={publish}
                  onChange={setPublish}
                  label="Publish to residents"
                  description="Published simulations are visible to residents. Drafts remain administrator-only."
                />
              </div>

              <label>
                <span className="field-label text-xs">Run notes</span>
                <textarea
                  className="field min-h-[70px] text-xs"
                  value={runNotes}
                  onChange={(event) => setRunNotes(event.target.value)}
                  placeholder="Optional note stored with this simulation snapshot."
                />
              </label>

              {runError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] text-rose-700">
                  {runError}
                </div>
              )}

              <Button
                fullWidth
                onClick={handleRun}
                loading={running}
                disabled={!selectedRunId || saving}
              >
                <PlayCircle size={15} />
                Run and save simulation
              </Button>
              <p className="text-[11px] leading-5 text-slate-500">
                Hourly flow order: solar → common demand → direct apartment
                allocation → charge from genuine surplus → discharge to unmet
                demand → grid import. Charging energy is never allocated to
                apartments in the same interval.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Active configuration"
              description="Historical simulations keep their original configuration link."
              icon={CheckCircle2}
            />
            <CardBody className="space-y-2.5 pt-1 text-xs">
              <SolarVaultInfoRow
                label="Version id"
                value={`#${configuration.id}`}
              />
              <SolarVaultInfoRow
                label="Active"
                value={configuration.is_active ? "Yes" : "No"}
              />
              <SolarVaultInfoRow
                label="Capacity"
                value={formatEnergy(configuration.capacity_kwh, 1)}
              />
              <SolarVaultInfoRow
                label="Usable capacity"
                value={formatEnergy(configuration.usable_capacity_kwh, 2)}
              />
              <SolarVaultInfoRow
                label="Max charge / discharge"
                value={`${formatNumber(
                  configuration.max_charge_kw,
                  2
                )} / ${formatNumber(configuration.max_discharge_kw, 2)} kW`}
              />
              <SolarVaultInfoRow
                label="Efficiencies"
                value={`${formatPercent(
                  configuration.charge_efficiency_pct,
                  1
                )} / ${formatPercent(
                  configuration.discharge_efficiency_pct,
                  1
                )}`}
              />
              <SolarVaultInfoRow
                label="SOC initial / min / max"
                value={`${formatPercent(
                  configuration.initial_soc_pct,
                  0
                )} / ${formatPercent(
                  configuration.min_soc_pct,
                  0
                )} / ${formatPercent(configuration.max_soc_pct, 0)}`}
              />
              <SolarVaultInfoRow
                label="Created"
                value={formatDateTime(configuration.created_at)}
              />
              {configuration.created_by && (
                <SolarVaultInfoRow
                  label="Created by"
                  value={configuration.created_by.name}
                />
              )}
              {simulation && (
                <div className="border-t border-slate-100 pt-2.5">
                  <SolarVaultInfoRow
                    label="Latest visible simulation"
                    value={simulation.simulation_code}
                  />
                  <SolarVaultInfoRow
                    label="Final SOC"
                    value={formatPercent(simulation.final_soc_pct, 1)}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
            <AlertTriangle
              size={15}
              className="mt-0.5 shrink-0 text-amber-500"
              aria-hidden="true"
            />
            <p className="text-[11px] leading-5">
              Saving a new version does not rewrite earlier simulations. The
              stored snapshot keeps its frozen capacity, power, efficiency and
              SOC parameters.
            </p>
          </div>

          <SolarVaultDisclaimer text={disclaimer} limitations={limitations} />
        </div>
      </div>
    </div>
  );
}
