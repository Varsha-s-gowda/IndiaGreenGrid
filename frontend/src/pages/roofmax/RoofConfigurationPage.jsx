import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  PlayCircle,
  RotateCcw,
  Save,
  Settings2,
  Sun,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import Toggle from "../../components/ui/Toggle";
import RoofMaxDisclaimer from "../../components/roofmax/RoofMaxDisclaimer";
import RoofMaxInfoRow from "../../components/roofmax/RoofMaxInfoRow";
import RoofMaxPageHeader from "../../components/roofmax/RoofMaxPageHeader";
import { useNotifications } from "../../context/NotificationContext";
import { useRoofMax } from "../../context/RoofMaxContext";
import { getApiErrorMessage, getValidationDetails } from "../../lib/apiError";
import {
  formatCapacity,
  formatDateTime,
  formatNumber,
  formatUtcDate,
} from "../../lib/formatters";
import {
  analyzeRoofCapacity,
  updateRoofConfiguration,
} from "../../services/roofmaxService";

const NUMERIC_FIELDS = [
  "usable_roof_area_m2",
  "panel_length_m",
  "panel_width_m",
  "panel_capacity_wp",
  "panel_efficiency_pct",
  "performance_ratio_pct",
  "system_loss_pct",
  "solar_irradiation_kwh_m2_day",
  "installation_cost_per_kwp",
  "maintenance_cost_per_kwp_year",
  "tariff_override_per_kwh",
  "tariff_escalation_pct",
  "maintenance_escalation_pct",
  "conservative_yield_variation_pct",
  "conservative_tariff_variation_pct",
  "conservative_cost_variation_pct",
  "optimistic_yield_variation_pct",
  "optimistic_tariff_variation_pct",
  "optimistic_cost_variation_pct",
  "short_horizon_years",
  "long_horizon_years",
];

function toForm(configuration) {
  if (!configuration) return null;
  const form = {
    name: configuration.name,
    location: configuration.location,
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
  for (const key of ["name", "location", "notes"]) {
    const next = (form[key] || "").trim();
    const previous = (initial[key] || "").trim();
    if (next !== previous) changes[key] = key === "notes" ? next || null : next;
  }
  for (const key of NUMERIC_FIELDS) {
    const next = numberValue(form[key]);
    const previous = initial[key] === null || initial[key] === undefined
      ? null
      : Number(initial[key]);
    if (key === "tariff_override_per_kwh" && (next === null || form[key] === "")) {
      if (previous !== null) changes[key] = null;
      continue;
    }
    if (next === null) continue;
    if (previous === null || Math.abs(next - previous) > 1e-9) {
      changes[key] = next;
    }
  }
  return changes;
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

export default function RoofConfigurationPage() {
  const { notify } = useNotifications();
  const {
    configuration,
    configurationLoading,
    configurationError,
    reloadConfiguration,
    runOptions,
    selectedRunId,
    selectRun,
    analysis,
    selectAnalysis,
    refresh,
    disclaimer,
    limitations,
  } = useRoofMax();

  const initial = useMemo(() => toForm(configuration), [configuration]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveDetails, setSaveDetails] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [publish, setPublish] = useState(true);
  const [analysisNotes, setAnalysisNotes] = useState("");

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
    setSaving(true);
    setSaveError("");
    setSaveDetails([]);
    try {
      const changes = buildChanges(form, configuration);
      if (!Object.keys(changes).length) {
        notify({
          type: "info",
          title: "No configuration changes",
          message: "Every field matches the active configuration version.",
          source: "RoofMax",
        });
        return;
      }
      const result = await updateRoofConfiguration(changes);
      await reloadConfiguration();
      await refresh();
      notify({
        type: "success",
        title: "Configuration version saved",
        message: `Version ${result.configuration.id} is now active. Previous analyses keep the assumptions they were calculated with.`,
        source: "RoofMax",
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

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const result = await analyzeRoofCapacity({
        simulation_run_id: selectedRunId || undefined,
        publish,
        notes: analysisNotes.trim() || undefined,
      });
      selectAnalysis(result.analysis.id);
      selectRun(result.analysis.simulation_run_id);
      await refresh();
      notify({
        type: "success",
        title: result.duplicate ? "Existing analysis reused" : "Analysis generated",
        message: `${result.analysis.analysis_code} recommends ${formatCapacity(
          result.analysis.recommended_capacity_kwp,
          2
        )} with ${formatNumber(
          result.analysis.recommended_panel_count
        )} panels.`,
        source: "RoofMax",
      });
    } catch (requestError) {
      setAnalysisError(
        getApiErrorMessage(requestError, "Unable to generate the analysis.")
      );
    } finally {
      setAnalyzing(false);
    }
  }

  if (configurationLoading) {
    return (
      <div className="space-y-6">
        <RoofMaxPageHeader
          icon={Settings2}
          title="Roof and financial assumptions"
          description="Administrator-controlled planning inputs. Saving appends a new version; historical analyses remain reproducible."
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
        <RoofMaxPageHeader
          icon={Settings2}
          title="Roof and financial assumptions"
          description="Administrator-controlled planning inputs."
        />
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Configuration unavailable"
              message={configurationError || "No RoofMax configuration exists."}
              onRetry={reloadConfiguration}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RoofMaxPageHeader
        icon={Settings2}
        title="Roof and financial assumptions"
        description="Only administrators can edit these planning inputs. Saving appends a new configuration version, so every stored analysis remains tied to the assumptions it was calculated with."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="forest" dot>
              <Lock size={11} />
              Administrator only
            </Badge>
            <Button variant="outline" size="sm" onClick={resetForm} disabled={saving}>
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
              title="Site and roof envelope"
              description="The usable area is treated as one contiguous rectangle. Walkways, tanks, shading and structural setbacks are not individually measured."
              icon={Settings2}
            />
            <CardBody className="grid gap-4 pt-1 md:grid-cols-2">
              <Input
                label="Plan name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
              />
              <Input
                label="Location"
                value={form.location}
                onChange={(event) => setField("location", event.target.value)}
              />
              <NumberField
                label="Usable roof area (m²)"
                value={form.usable_roof_area_m2}
                onChange={(value) => setField("usable_roof_area_m2", value)}
                step="0.01"
                min="0"
                hint="Area available for panels after setbacks."
              />
              <NumberField
                label="Panel length (m)"
                value={form.panel_length_m}
                onChange={(value) => setField("panel_length_m", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Panel width (m)"
                value={form.panel_width_m}
                onChange={(value) => setField("panel_width_m", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Panel rating (Wp)"
                value={form.panel_capacity_wp}
                onChange={(value) => setField("panel_capacity_wp", value)}
                step="1"
                min="0"
              />
              <NumberField
                label="Panel efficiency (%)"
                value={form.panel_efficiency_pct}
                onChange={(value) => setField("panel_efficiency_pct", value)}
                step="0.001"
                min="0"
                hint="Datasheet efficiency; recorded for transparency."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Generation assumptions"
              description="One location-based irradiation value is used. RoofMax does not simulate hourly weather, temperature derating or soiling."
              icon={Sun}
            />
            <CardBody className="grid gap-4 pt-1 md:grid-cols-3">
              <NumberField
                label="Irradiation (kWh/m²/day)"
                value={form.solar_irradiation_kwh_m2_day}
                onChange={(value) => setField("solar_irradiation_kwh_m2_day", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Performance ratio (%)"
                value={form.performance_ratio_pct}
                onChange={(value) => setField("performance_ratio_pct", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="System loss (%)"
                value={form.system_loss_pct}
                onChange={(value) => setField("system_loss_pct", value)}
                step="0.001"
                min="0"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Costs, tariff and escalation"
              description="Savings only come from self-consumed solar. Surplus generation is assumed to earn no export credit."
              icon={Info}
            />
            <CardBody className="grid gap-4 pt-1 md:grid-cols-2 xl:grid-cols-3">
              <NumberField
                label="Installation cost (₹/kWp)"
                value={form.installation_cost_per_kwp}
                onChange={(value) => setField("installation_cost_per_kwp", value)}
                step="0.01"
                min="0"
              />
              <NumberField
                label="Maintenance (₹/kWp/year)"
                value={form.maintenance_cost_per_kwp_year}
                onChange={(value) => setField("maintenance_cost_per_kwp_year", value)}
                step="0.01"
                min="0"
              />
              <NumberField
                label="Tariff override (₹/kWh)"
                value={form.tariff_override_per_kwh}
                onChange={(value) => setField("tariff_override_per_kwh", value)}
                step="0.0001"
                min="0"
                hint="Leave blank to use the stored electricity tariff."
              />
              <NumberField
                label="Tariff escalation (%/year)"
                value={form.tariff_escalation_pct}
                onChange={(value) => setField("tariff_escalation_pct", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Maintenance escalation (%/year)"
                value={form.maintenance_escalation_pct}
                onChange={(value) => setField("maintenance_escalation_pct", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Short horizon (years)"
                value={form.short_horizon_years}
                onChange={(value) => setField("short_horizon_years", value)}
                step="1"
                min="1"
              />
              <NumberField
                label="Long horizon (years)"
                value={form.long_horizon_years}
                onChange={(value) => setField("long_horizon_years", value)}
                step="1"
                min="1"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Scenario variations"
              description="Applied around the standard assumptions. Conservative lowers yield and tariff and raises cost; optimistic does the opposite."
              icon={AlertTriangle}
            />
            <CardBody className="grid gap-4 pt-1 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-xs font-semibold text-slate-700">Conservative</p>
                <NumberField
                  label="Yield reduction (%)"
                  value={form.conservative_yield_variation_pct}
                  onChange={(value) =>
                    setField("conservative_yield_variation_pct", value)
                  }
                  step="0.001"
                  min="0"
                />
                <NumberField
                  label="Tariff reduction (%)"
                  value={form.conservative_tariff_variation_pct}
                  onChange={(value) =>
                    setField("conservative_tariff_variation_pct", value)
                  }
                  step="0.001"
                  min="0"
                />
                <NumberField
                  label="Cost increase (%)"
                  value={form.conservative_cost_variation_pct}
                  onChange={(value) =>
                    setField("conservative_cost_variation_pct", value)
                  }
                  step="0.001"
                  min="0"
                />
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-xs font-semibold text-slate-700">Optimistic</p>
                <NumberField
                  label="Yield increase (%)"
                  value={form.optimistic_yield_variation_pct}
                  onChange={(value) =>
                    setField("optimistic_yield_variation_pct", value)
                  }
                  step="0.001"
                  min="0"
                />
                <NumberField
                  label="Tariff increase (%)"
                  value={form.optimistic_tariff_variation_pct}
                  onChange={(value) =>
                    setField("optimistic_tariff_variation_pct", value)
                  }
                  step="0.001"
                  min="0"
                />
                <NumberField
                  label="Cost reduction (%)"
                  value={form.optimistic_cost_variation_pct}
                  onChange={(value) =>
                    setField("optimistic_cost_variation_pct", value)
                  }
                  step="0.001"
                  min="0"
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Notes"
              description="Optional context stored with the configuration version."
              icon={Info}
            />
            <CardBody className="pt-1">
              <label>
                <span className="field-label text-xs">Configuration notes</span>
                <textarea
                  className="field min-h-[90px] text-xs"
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  placeholder="Quotation reference, roof survey date, assumptions verified with the society…"
                />
              </label>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Generate analysis"
              description="Reads stored demand from the selected completed SolarTwin run and saves an immutable snapshot."
              icon={PlayCircle}
            />
            <CardBody className="space-y-4 pt-1">
              <label>
                <span className="field-label text-xs">SolarTwin run</span>
                <select
                  className="field h-10 text-xs"
                  value={selectedRunId || ""}
                  onChange={(event) =>
                    selectRun(event.target.value ? Number(event.target.value) : null)
                  }
                  disabled={!runOptions.length || analyzing}
                >
                  {!runOptions.length && <option value="">No completed run</option>}
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
                  description="Published analyses are visible to residents. Draft analyses remain administrator-only."
                />
              </div>

              <label>
                <span className="field-label text-xs">Analysis notes</span>
                <textarea
                  className="field min-h-[70px] text-xs"
                  value={analysisNotes}
                  onChange={(event) => setAnalysisNotes(event.target.value)}
                  placeholder="Optional note stored with this analysis snapshot."
                />
              </label>

              {analysisError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] text-rose-700">
                  {analysisError}
                </div>
              )}

              <Button
                fullWidth
                onClick={handleAnalyze}
                loading={analyzing}
                disabled={!selectedRunId}
              >
                <PlayCircle size={15} />
                Generate analysis from stored demand
              </Button>
              <p className="text-[11px] leading-5 text-slate-500">
                Demand is annualised from the run period. Generation uses the saved
                irradiation and performance assumptions. No value is calculated in
                the browser.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Active configuration"
              description="Historical analyses keep their original configuration link."
              icon={CheckCircle2}
            />
            <CardBody className="space-y-2.5 pt-1 text-xs">
              <RoofMaxInfoRow label="Version id" value={`#${configuration.id}`} />
              <RoofMaxInfoRow label="Active" value={configuration.is_active ? "Yes" : "No"} />
              <RoofMaxInfoRow
                label="Rooftop"
                value={`${formatNumber(configuration.usable_roof_area_m2, 2)} m²`}
              />
              <RoofMaxInfoRow
                label="Panel area"
                value={`${formatNumber(configuration.panel_area_m2, 3)} m²`}
              />
              <RoofMaxInfoRow
                label="Specific yield"
                value={`${formatNumber(
                  configuration.specific_daily_yield_kwh_per_kwp,
                  2
                )} kWh/kWp/day`}
              />
              <RoofMaxInfoRow
                label="Installation"
                value={`₹${formatNumber(configuration.installation_cost_per_kwp, 0)}/kWp`}
              />
              <RoofMaxInfoRow
                label="Created"
                value={formatDateTime(configuration.created_at)}
              />
              {configuration.created_by && (
                <RoofMaxInfoRow
                  label="Created by"
                  value={configuration.created_by.name}
                />
              )}
              {analysis && (
                <>
                  <div className="border-t border-slate-100 pt-2.5">
                    <RoofMaxInfoRow
                      label="Current analysis"
                      value={analysis.analysis_code}
                    />
                    <RoofMaxInfoRow
                      label="Recommended"
                      value={formatCapacity(analysis.recommended_capacity_kwp, 2)}
                    />
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <RoofMaxDisclaimer text={disclaimer} limitations={limitations} />
        </div>
      </div>
    </div>
  );
}
