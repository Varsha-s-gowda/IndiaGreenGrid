import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  BatteryFull,
  CheckCircle2,
  Gauge,
  History,
  PlugZap,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import StatCard from "../../components/ui/StatCard";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import SolarVaultDisclaimer from "../../components/solarvault/SolarVaultDisclaimer";
import SolarVaultInfoRow from "../../components/solarvault/SolarVaultInfoRow";
import SolarVaultPageHeader from "../../components/solarvault/SolarVaultPageHeader";
import SolarVaultState from "../../components/solarvault/SolarVaultState";
import SolarVaultToolbar from "../../components/solarvault/SolarVaultToolbar";
import { useSolarVault } from "../../context/SolarVaultContext";
import {
  formatCurrency,
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcHourOnly,
} from "../../lib/formatters";

const STATUS_LABELS = {
  DISABLED: "Disabled",
  DEPLETED: "At reserve",
  FULL: "Full",
  CHARGING: "Charging",
  DISCHARGING: "Discharging",
  CHARGING_CAPABLE: "Charging capable",
  IDLE: "Idle",
};

const STATUS_TONES = {
  DISABLED: "slate",
  DEPLETED: "rose",
  FULL: "emerald",
  CHARGING: "sky",
  DISCHARGING: "amber",
  CHARGING_CAPABLE: "forest",
  IDLE: "forest",
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}

export default function BatteryOverviewPage() {
  const {
    isAdmin,
    simulation,
    overview,
    hourly,
    configuration,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useSolarVault();

  const socSeries = hourly.map((row) => ({
    label: formatUtcHourOnly(row.timestamp),
    soc: Number(row.soc_percentage || 0),
    charge: Number(row.charge_energy_kwh || 0),
    discharge: Number(row.discharge_energy_kwh || 0),
  }));
  const tickInterval = Math.max(
    0,
    Math.ceil(socSeries.length / 12) - 1
  );

  return (
    <div className="space-y-6">
      <SolarVaultPageHeader
        icon={BatteryCharging}
        title="Battery storage overview"
        description="Hourly battery dispatch computed from stored SolarTwin generation and demand. State of charge, charging, discharging, grid import and savings all come from the backend engine."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isAdmin ? "info" : "success"} dot>
              <ShieldCheck size={11} />
              {isAdmin ? "Administrator view" : "Published view"}
            </Badge>
            {isAdmin && (
              <Link to="/solarvault/configuration">
                <Button size="sm">
                  <Zap size={14} />
                  Run simulation
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <SolarVaultToolbar onRefresh={refresh} refreshing={detailLoading} />

      <SolarVaultState>
        {simulation && overview && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Battery status"
                value={statusLabel(overview.battery_status)}
                detail={`Final SOC ${formatPercent(
                  overview.current_soc_pct,
                  1
                )} after ${formatNumber(simulation.hour_count)} hours`}
                icon={BatteryCharging}
                tone={STATUS_TONES[overview.battery_status] || "forest"}
              />
              <StatCard
                label="Stored energy"
                value={formatEnergy(overview.stored_energy_kwh, 2)}
                detail={`${formatPercent(
                  overview.current_soc_pct,
                  1
                )} of ${formatEnergy(overview.capacity_kwh, 1)} capacity`}
                icon={BatteryFull}
                tone="sky"
              />
              <StatCard
                label="Grid import avoided"
                value={formatEnergy(simulation.grid_reduction_kwh, 2)}
                detail={`${formatPercent(
                  simulation.grid_reduction_pct,
                  1
                )} lower grid dependency`}
                icon={PlugZap}
                tone="emerald"
              />
              <StatCard
                label="Estimated savings"
                value={formatCurrency(simulation.estimated_savings)}
                detail={`Flat tariff ₹${formatNumber(
                  simulation.tariff_price_per_kwh,
                  2
                )}/kWh`}
                icon={Sparkles}
                tone="amber"
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="State of charge across the run"
                  description="Carried forward hour by hour with configured charge and discharge efficiencies. The shaded band marks the minimum-reserve and maximum-SOC limits."
                  icon={Activity}
                  action={
                    <Badge variant="forest" dot>
                      {formatUtcDate(simulation.period_start)} –{" "}
                      {formatUtcDate(simulation.period_end)}
                    </Badge>
                  }
                />
                <CardBody className="pt-1">
                  {socSeries.length ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={socSeries}
                          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="solarvaultSoc"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#166534"
                                stopOpacity={0.35}
                              />
                              <stop
                                offset="100%"
                                stopColor="#166534"
                                stopOpacity={0.02}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 9 }}
                            interval={tickInterval}
                          />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            width={40}
                            domain={[0, 100]}
                            tickFormatter={(value) => `${value}%`}
                          />
                          <Tooltip content={<ChartTooltip unit="%" />} />
                          <ReferenceLine
                            y={Number(simulation.min_soc_pct)}
                            stroke="#f59e0b"
                            strokeDasharray="4 4"
                            label={{
                              value: "Reserve",
                              fontSize: 9,
                              fill: "#b45309",
                              position: "insideTopRight",
                            }}
                          />
                          <ReferenceLine
                            y={Number(simulation.max_soc_pct)}
                            stroke="#0ea5e9"
                            strokeDasharray="4 4"
                            label={{
                              value: "Maximum",
                              fontSize: 9,
                              fill: "#0369a1",
                              position: "insideBottomRight",
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="soc"
                            name="State of charge"
                            stroke="#166534"
                            strokeWidth={2}
                            fill="url(#solarvaultSoc)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState
                      compact
                      title="No hourly state of charge"
                      description="The selected simulation has no stored hourly records."
                    />
                  )}
                </CardBody>
              </Card>

              <div className="space-y-5">
                <Card>
                  <CardHeader
                    title="Battery state"
                    description="Final interval of the selected simulation."
                    icon={BatteryFull}
                  />
                  <CardBody className="pt-1">
                    <BatteryGauge
                      soc={Number(overview.current_soc_pct || 0)}
                      min={Number(simulation.min_soc_pct || 0)}
                      max={Number(simulation.max_soc_pct || 0)}
                      status={overview.battery_status}
                    />
                    <div className="mt-4 space-y-2.5 text-xs">
                      <SolarVaultInfoRow
                        label="Stored energy"
                        value={formatEnergy(overview.stored_energy_kwh, 2)}
                      />
                      <SolarVaultInfoRow
                        label="Usable capacity"
                        value={formatEnergy(overview.usable_capacity_kwh, 2)}
                      />
                      <SolarVaultInfoRow
                        label="Initial SOC"
                        value={formatPercent(
                          simulation.initial_soc_actual_pct,
                          1
                        )}
                      />
                      <SolarVaultInfoRow
                        label="Final SOC"
                        value={formatPercent(simulation.final_soc_pct, 1)}
                      />
                      <SolarVaultInfoRow
                        label="Reserve / maximum"
                        value={`${formatPercent(
                          simulation.min_soc_pct,
                          0
                        )} / ${formatPercent(simulation.max_soc_pct, 0)}`}
                      />
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Simulation snapshot"
                    description="Frozen inputs used by this stored result."
                    icon={History}
                  />
                  <CardBody className="space-y-2.5 pt-1 text-xs">
                    <SolarVaultInfoRow
                      label="Code"
                      value={simulation.simulation_code}
                    />
                    <SolarVaultInfoRow
                      label="Status"
                      value={simulation.status}
                    />
                    <SolarVaultInfoRow
                      label="SolarTwin run"
                      value={`#${simulation.simulation_run_id}`}
                    />
                    <SolarVaultInfoRow
                      label="Period"
                      value={`${formatUtcDate(
                        simulation.period_start
                      )} – ${formatUtcDate(simulation.period_end)}`}
                    />
                    <SolarVaultInfoRow
                      label="Intervals"
                      value={`${formatNumber(simulation.hour_count)} hours`}
                    />
                    <SolarVaultInfoRow
                      label="Created"
                      value={formatDateTime(simulation.created_at)}
                    />
                    <SolarVaultInfoRow
                      label="Conservation"
                      value={
                        simulation.conservation_ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 size={11} />
                            Reconciled
                          </span>
                        ) : (
                          <span className="text-rose-600">Mismatch</span>
                        )
                      }
                    />
                  </CardBody>
                </Card>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card>
                <CardHeader
                  title="Battery system"
                  description="Parameters frozen at simulation time."
                  icon={Settings2}
                  action={
                    isAdmin ? (
                      <Link
                        to="/solarvault/configuration"
                        className="text-[11px] font-medium text-forest-700 hover:text-forest-900"
                      >
                        Configure
                      </Link>
                    ) : null
                  }
                />
                <CardBody className="space-y-2.5 pt-1 text-xs">
                  <SolarVaultInfoRow
                    label="Capacity"
                    value={formatEnergy(simulation.capacity_kwh, 1)}
                  />
                  <SolarVaultInfoRow
                    label="Max charge power"
                    value={`${formatNumber(simulation.max_charge_kw, 2)} kW`}
                  />
                  <SolarVaultInfoRow
                    label="Max discharge power"
                    value={`${formatNumber(
                      simulation.max_discharge_kw,
                      2
                    )} kW`}
                  />
                  <SolarVaultInfoRow
                    label="Charge efficiency"
                    value={formatPercent(
                      simulation.charge_efficiency_pct,
                      1
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Discharge efficiency"
                    value={formatPercent(
                      simulation.discharge_efficiency_pct,
                      1
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Configuration"
                    value={`#${simulation.battery_configuration_id}`}
                  />
                  {configuration && configuration.id !== simulation.battery_configuration_id && (
                    <p className="border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-500">
                      The active configuration is now version #{configuration.id}.
                      This simulation keeps the parameters it was produced with.
                    </p>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Energy accounting"
                  description="Separate storage flows, never double counted."
                  icon={Zap}
                />
                <CardBody className="space-y-2.5 pt-1 text-xs">
                  <SolarVaultInfoRow
                    label="Solar generation"
                    value={formatEnergy(
                      simulation.total_solar_generation_kwh,
                      2
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Direct solar used"
                    value={formatEnergy(simulation.direct_solar_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Energy drawn to charge"
                    value={formatEnergy(simulation.total_charged_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Stored gain"
                    value={formatEnergy(simulation.total_stored_gain_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Delivered on discharge"
                    value={formatEnergy(simulation.total_discharged_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Stored energy used"
                    value={formatEnergy(simulation.total_stored_used_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Round-trip losses"
                    value={formatEnergy(simulation.total_losses_kwh, 2)}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Baseline versus storage"
                  description="The no-battery baseline is preserved unchanged."
                  icon={PlugZap}
                  action={
                    <Link
                      to="/solarvault/comparison"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-forest-700 hover:text-forest-900"
                    >
                      Compare
                      <ArrowRight size={12} />
                    </Link>
                  }
                />
                <CardBody className="space-y-2.5 pt-1 text-xs">
                  <SolarVaultInfoRow
                    label="Grid import without battery"
                    value={formatEnergy(
                      simulation.baseline_grid_import_kwh,
                      2
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Grid import with battery"
                    value={formatEnergy(simulation.grid_import_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Surplus without battery"
                    value={formatEnergy(
                      simulation.baseline_surplus_kwh,
                      2
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Remaining surplus"
                    value={formatEnergy(
                      simulation.remaining_surplus_kwh,
                      2
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Solar utilization"
                    value={`${formatPercent(
                      simulation.baseline_solar_utilization_pct,
                      1
                    )} → ${formatPercent(
                      simulation.solar_utilization_pct,
                      1
                    )}`}
                  />
                  <SolarVaultInfoRow
                    label="Demand served on site"
                    value={formatPercent(
                      simulation.building_demand_coverage_pct ??
                        (Number(simulation.total_building_demand_kwh) > 0
                          ? ((Number(simulation.direct_solar_kwh) +
                              Number(simulation.total_discharged_kwh)) /
                              Number(simulation.total_building_demand_kwh)) *
                            100
                          : 0),
                      1
                    )}
                  />
                  <div className="border-t border-slate-100 pt-2">
                    <Link
                      to="/solarvault/hourly"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-forest-700 hover:text-forest-900"
                    >
                      <Sun size={12} />
                      Inspect hourly dispatch
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </CardBody>
              </Card>
            </div>

            <SolarVaultDisclaimer
              text={disclaimer}
              limitations={limitations}
            />
          </>
        )}
      </SolarVaultState>
    </div>
  );
}

function BatteryGauge({ soc, min, max, status }) {
  const safe = Math.max(0, Math.min(100, Number(soc) || 0));
  const minSafe = Math.max(0, Math.min(100, Number(min) || 0));
  const maxSafe = Math.max(0, Math.min(100, Number(max) || 0));
  const disabled = status === "DISABLED";

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-slate-600">
          State of charge
        </span>
        <span className="text-lg font-semibold text-slate-900">
          {formatPercent(safe, 1)}
        </span>
      </div>
      <div className="relative mt-2 h-8 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <div
          className={`h-full transition-all ${
            disabled
              ? "bg-slate-300"
              : safe <= minSafe + 0.01
                ? "bg-amber-400"
                : safe >= maxSafe - 0.01
                  ? "bg-emerald-500"
                  : "bg-forest-600"
          }`}
          style={{ width: `${safe}%` }}
        />
        <span
          className="absolute inset-y-0 border-l border-dashed border-amber-500"
          style={{ left: `${minSafe}%` }}
          aria-hidden="true"
        />
        <span
          className="absolute inset-y-0 border-l border-dashed border-sky-500"
          style={{ left: `${maxSafe}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
        <span>0%</span>
        <span>Reserve {formatPercent(minSafe, 0)}</span>
        <span>Max {formatPercent(maxSafe, 0)}</span>
        <span>100%</span>
      </div>
    </div>
  );
}
