import { useEffect, useMemo, useState } from "react";
import {
  BatteryCharging,
  FlaskConical,
  Info,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import SolarVaultDisclaimer from "../../components/solarvault/SolarVaultDisclaimer";
import SolarVaultInfoRow from "../../components/solarvault/SolarVaultInfoRow";
import SolarVaultPageHeader from "../../components/solarvault/SolarVaultPageHeader";
import { useNotifications } from "../../context/NotificationContext";
import { useSolarVault } from "../../context/SolarVaultContext";
import { getApiErrorMessage, getValidationDetails } from "../../lib/apiError";
import {
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { runBatterySimulation } from "../../services/solarvaultService";

const OVERRIDE_FIELDS = [
  "capacity_kwh",
  "max_charge_kw",
  "max_discharge_kw",
  "charge_efficiency_pct",
  "discharge_efficiency_pct",
  "initial_soc_pct",
  "min_soc_pct",
  "max_soc_pct",
];

function formFromConfiguration(configuration) {
  if (!configuration) return null;
  return Object.fromEntries(
    OVERRIDE_FIELDS.map((key) => [
      key,
      configuration[key] === null || configuration[key] === undefined
        ? ""
        : String(configuration[key]),
    ])
  );
}

function numberValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateForm(form) {
  const problems = [];
  const values = {};
  for (const key of OVERRIDE_FIELDS) {
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

export default function BatteryScenarioPage() {
  const { notify } = useNotifications();
  const {
    configuration,
    configurationLoading,
    configurationError,
    runOptions,
    selectedRunId,
    selectedRun,
    selectRun,
    simulation,
    refresh,
    disclaimer,
    limitations,
  } = useSolarVault();

  const initial = useMemo(
    () => formFromConfiguration(configuration),
    [configuration]
  );
  const [form, setForm] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm(initial);
    setResult(null);
    setError("");
    setDetails([]);
  }

  async function handleRun() {
    const problems = validateForm(form);
    if (problems.length) {
      setError(problems.join(" "));
      setDetails([]);
      return;
    }
    if (!selectedRunId) {
      setError("Select a completed SolarTwin run first.");
      return;
    }

    setRunning(true);
    setError("");
    setDetails([]);
    try {
      const overrides = Object.fromEntries(
        OVERRIDE_FIELDS.map((key) => [key, numberValue(form[key])])
      );
      const response = await runBatterySimulation({
        simulation_run_id: selectedRunId,
        save: false,
        publish: false,
        overrides,
      });
      setResult(response);
      notify({
        type: "success",
        title: "Scenario calculated",
        message: `${response.simulation.simulation_code}: ${formatEnergy(
          response.comparison.savings.grid_reduction_kwh,
          2
        )} grid import avoided. Nothing was saved to the database.`,
        source: "SolarVault",
      });
    } catch (requestError) {
      setResult(null);
      setError(
        getApiErrorMessage(requestError, "Unable to run the scenario.")
      );
      setDetails(getValidationDetails(requestError));
    } finally {
      setRunning(false);
    }
  }

  if (configurationLoading) {
    return (
      <div className="space-y-6">
        <SolarVaultPageHeader
          icon={FlaskConical}
          title="Scenario simulator"
          description="Try hypothetical battery parameters against stored SolarTwin readings without saving anything."
        />
        <Card>
          <CardBody className="space-y-3 pt-5">
            <Skeleton className="h-4 w-48" />
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
          icon={FlaskConical}
          title="Scenario simulator"
          description="Try hypothetical battery parameters without saving anything."
        />
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Configuration unavailable"
              message={
                configurationError || "No SolarVault configuration exists."
              }
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  const baseline = result?.comparison?.baseline;
  const scenario = result?.comparison?.with_battery;
  const savings = result?.comparison?.savings;

  const chartData = result
    ? [
        {
          metric: "Grid import",
          baseline: Number(baseline?.grid_import_kwh || 0),
          scenario: Number(scenario?.grid_import_kwh || 0),
        },
        {
          metric: "Surplus solar",
          baseline: Number(baseline?.remaining_surplus_kwh || 0),
          scenario: Number(scenario?.remaining_surplus_kwh || 0),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <SolarVaultPageHeader
        icon={FlaskConical}
        title="Scenario simulator"
        description="Change one or more battery parameters and recalculate hourly dispatch against stored SolarTwin readings. The hypothetical run never writes simulations, hourly records or configuration versions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning" dot>
              <FlaskConical size={11} />
              Nothing is saved
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={running}
            >
              <RotateCcw size={13} />
              Reset
            </Button>
          </div>
        }
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[11px] leading-5">
          This is a what-if calculation only. It uses <code>save=false</code> in
          the API request, so no simulation snapshot or hourly records are
          inserted. Save the configuration first if you want to keep a result.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Hypothetical battery parameters"
              description="These values override the active configuration for this one calculation only."
              icon={BatteryCharging}
            />
            <CardBody className="grid gap-4 pt-1 md:grid-cols-2 xl:grid-cols-3">
              <NumberField
                label="Battery capacity (kWh)"
                value={form.capacity_kwh}
                onChange={(value) => setField("capacity_kwh", value)}
                step="0.001"
                min="0"
                hint="Set 0 to preview the no-battery baseline."
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
              <NumberField
                label="Charge efficiency (%)"
                value={form.charge_efficiency_pct}
                onChange={(value) =>
                  setField("charge_efficiency_pct", value)
                }
                step="0.001"
                min="0"
              />
              <NumberField
                label="Discharge efficiency (%)"
                value={form.discharge_efficiency_pct}
                onChange={(value) =>
                  setField("discharge_efficiency_pct", value)
                }
                step="0.001"
                min="0"
              />
              <NumberField
                label="Initial SOC (%)"
                value={form.initial_soc_pct}
                onChange={(value) => setField("initial_soc_pct", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Minimum reserve SOC (%)"
                value={form.min_soc_pct}
                onChange={(value) => setField("min_soc_pct", value)}
                step="0.001"
                min="0"
              />
              <NumberField
                label="Maximum SOC (%)"
                value={form.max_soc_pct}
                onChange={(value) => setField("max_soc_pct", value)}
                step="0.001"
                min="0"
              />
            </CardBody>
          </Card>

          {error && (
            <Card>
              <CardBody className="pt-5">
                <ErrorState
                  title="Scenario was not calculated"
                  message={
                    details.length ? `${error} ${details.join(" ")}` : error
                  }
                  compact
                />
              </CardBody>
            </Card>
          )}

          {result && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Grid import avoided"
                  value={formatEnergy(savings?.grid_reduction_kwh, 2)}
                  detail={`${formatPercent(
                    savings?.grid_reduction_pct,
                    1
                  )} of baseline`}
                  icon={Zap}
                  tone="emerald"
                />
                <StatCard
                  label="Solar utilization"
                  value={formatPercent(
                    scenario?.solar_utilization_pct,
                    1
                  )}
                  detail={`${formatPercent(
                    baseline?.solar_utilization_pct,
                    1
                  )} without storage`}
                  icon={Sparkles}
                  tone="forest"
                />
                <StatCard
                  label="Surplus reduced"
                  value={formatEnergy(
                    savings?.surplus_reduction_kwh,
                    2
                  )}
                  detail={`${formatEnergy(
                    scenario?.remaining_surplus_kwh,
                    2
                  )} remains`}
                  icon={BatteryCharging}
                  tone="sky"
                />
                <StatCard
                  label="Estimated savings"
                  value={formatCurrency(savings?.estimated_savings)}
                  detail={`₹${formatNumber(
                    savings?.tariff_price_per_kwh,
                    2
                  )}/kWh`}
                  icon={Sparkles}
                  tone="amber"
                />
              </div>

              <Card>
                <CardHeader
                  title="Hypothetical scenario result"
                  description={`${result.simulation.simulation_code} · ${formatNumber(
                    result.simulation.hour_count
                  )} hourly intervals recalculated. Nothing was persisted.`}
                  icon={FlaskConical}
                  action={
                    <Badge variant="warning" dot>
                      Preview only
                    </Badge>
                  }
                />
                <CardBody className="pt-1">
                  <div className="grid gap-x-6 gap-y-2.5 text-xs md:grid-cols-2">
                    <SolarVaultInfoRow
                      label="Capacity"
                      value={formatEnergy(result.simulation.capacity_kwh, 1)}
                    />
                    <SolarVaultInfoRow
                      label="Usable capacity"
                      value={formatEnergy(
                        result.simulation.assumptions?.parameters
                          ?.usable_capacity_kwh,
                        2
                      )}
                    />
                    <SolarVaultInfoRow
                      label="Energy charged"
                      value={formatEnergy(
                        result.simulation.total_charged_kwh,
                        2
                      )}
                    />
                    <SolarVaultInfoRow
                      label="Energy discharged"
                      value={formatEnergy(
                        result.simulation.total_discharged_kwh,
                        2
                      )}
                    />
                    <SolarVaultInfoRow
                      label="Round-trip losses"
                      value={formatEnergy(
                        result.simulation.total_losses_kwh,
                        2
                      )}
                    />
                    <SolarVaultInfoRow
                      label="Final SOC"
                      value={formatPercent(
                        result.simulation.final_soc_pct,
                        1
                      )}
                    />
                    <SolarVaultInfoRow
                      label="Baseline grid import"
                      value={formatEnergy(baseline?.grid_import_kwh, 2)}
                    />
                    <SolarVaultInfoRow
                      label="Scenario grid import"
                      value={formatEnergy(scenario?.grid_import_kwh, 2)}
                    />
                    <SolarVaultInfoRow
                      label="Baseline surplus"
                      value={formatEnergy(
                        baseline?.remaining_surplus_kwh,
                        2
                      )}
                    />
                    <SolarVaultInfoRow
                      label="Scenario surplus"
                      value={formatEnergy(
                        scenario?.remaining_surplus_kwh,
                        2
                      )}
                    />
                    <SolarVaultInfoRow
                      label="Conservation"
                      value={
                        result.simulation.conservation_ok
                          ? "Reconciled"
                          : "Check failed"
                      }
                    />
                    <SolarVaultInfoRow
                      label="Saved records"
                      value="None"
                    />
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Scenario against the no-battery baseline"
                  description="Both bars are calculated from the same stored SolarTwin run."
                  icon={Zap}
                />
                <CardBody className="pt-1">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                          vertical={false}
                        />
                        <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={58} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} iconSize={9} />
                        <Bar
                          dataKey="baseline"
                          name="Without battery"
                          fill="#94a3b8"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="scenario"
                          name="Hypothetical battery"
                          fill="#166534"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
            </>
          )}

          {!result && !error && (
            <Card>
              <CardBody className="pt-5">
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm">
                    <FlaskConical size={22} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-slate-800">
                    No scenario calculated yet
                  </h3>
                  <p className="mt-1.5 max-w-md text-xs leading-6 text-slate-500">
                    Adjust the hypothetical parameters and run the scenario. The
                    backend recalculates every hourly interval from stored
                    readings.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Run scenario"
              description="Select the completed SolarTwin run to recalculate."
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

              <Button
                fullWidth
                onClick={handleRun}
                loading={running}
                disabled={!selectedRunId}
              >
                <FlaskConical size={15} />
                Calculate scenario
              </Button>
              <p className="text-[11px] leading-5 text-slate-500">
                The request sets <code>save=false</code>. No simulation,
                hourly record or configuration row is created.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Active configuration reference"
              description="The scenario starts from these values."
              icon={ShieldCheck}
            />
            <CardBody className="space-y-2.5 pt-1 text-xs">
              <SolarVaultInfoRow
                label="Version"
                value={`#${configuration.id}`}
              />
              <SolarVaultInfoRow
                label="Capacity"
                value={formatEnergy(configuration.capacity_kwh, 1)}
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
              {simulation && (
                <div className="border-t border-slate-100 pt-2.5">
                  <SolarVaultInfoRow
                    label="Saved simulation"
                    value={simulation.simulation_code}
                  />
                  <SolarVaultInfoRow
                    label="Saved grid import"
                    value={formatEnergy(simulation.grid_import_kwh, 2)}
                  />
                </div>
              )}
              {selectedRun && (
                <div className="border-t border-slate-100 pt-2.5">
                  <SolarVaultInfoRow
                    label="Selected run"
                    value={`#${selectedRun.id}`}
                  />
                  <SolarVaultInfoRow
                    label="Run period"
                    value={`${formatUtcDate(
                      selectedRun.start_date
                    )} – ${formatUtcDate(selectedRun.end_date)}`}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sky-900">
            <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-[11px] leading-5">
              The active saved simulation is not recalculated or replaced. Run
              and save from the configuration page to keep a new version.
            </p>
          </div>

          <SolarVaultDisclaimer text={disclaimer} limitations={limitations} />
        </div>
      </div>
    </div>
  );
}
