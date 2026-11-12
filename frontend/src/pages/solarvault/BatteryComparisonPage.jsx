import {
  BatteryCharging,
  CheckCircle2,
  GitCompare,
  IndianRupee,
  Info,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Sun,
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
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
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
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";

function signedEnergy(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) < 1e-9) return "—";
  return `${numeric > 0 ? "+" : "−"}${formatEnergy(Math.abs(numeric), 2)}`;
}

function signedPercentPoints(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) < 1e-9) return "—";
  return `${numeric > 0 ? "+" : "−"}${formatNumber(Math.abs(numeric), 1)} pp`;
}

function deltaTone(delta, goodWhen) {
  if (Math.abs(delta) < 1e-9) return "text-slate-400";
  if (!goodWhen) return "text-slate-600";
  const good = goodWhen === "higher" ? delta > 0 : delta < 0;
  return good ? "text-emerald-700" : "text-rose-600";
}

export default function BatteryComparisonPage() {
  const {
    simulation,
    comparison,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useSolarVault();

  const baseline = comparison?.baseline || {};
  const withBattery = comparison?.with_battery || {};
  const savings = comparison?.savings || {};

  const rows = [
    {
      key: "solar",
      label: "Solar generation",
      baseline: baseline.solar_generation_kwh,
      battery: withBattery.solar_generation_kwh,
      display: "energy",
    },
    {
      key: "direct",
      label: "Direct solar consumption",
      baseline: baseline.direct_solar_kwh,
      battery: withBattery.direct_solar_kwh,
      display: "energy",
    },
    {
      key: "stored",
      label: "Energy drawn into storage",
      baseline: baseline.stored_energy_kwh,
      battery: withBattery.stored_energy_kwh,
      display: "energy",
    },
    {
      key: "discharged",
      label: "Energy discharged to demand",
      baseline: baseline.discharged_kwh,
      battery: withBattery.discharged_kwh,
      display: "energy",
    },
    {
      key: "charge-loss",
      label: "Charge losses",
      baseline: baseline.charge_loss_kwh,
      battery: withBattery.charge_loss_kwh,
      display: "energy",
    },
    {
      key: "discharge-loss",
      label: "Discharge losses",
      baseline: baseline.discharge_loss_kwh,
      battery: withBattery.discharge_loss_kwh,
      display: "energy",
    },
    {
      key: "losses",
      label: "Total round-trip losses",
      baseline: baseline.total_losses_kwh,
      battery: withBattery.total_losses_kwh,
      display: "energy",
    },
    {
      key: "grid",
      label: "Grid import",
      baseline: baseline.grid_import_kwh,
      battery: withBattery.grid_import_kwh,
      display: "energy",
      goodWhen: "lower",
    },
    {
      key: "surplus",
      label: "Remaining surplus solar",
      baseline: baseline.remaining_surplus_kwh,
      battery: withBattery.remaining_surplus_kwh,
      display: "energy",
      goodWhen: "lower",
    },
    {
      key: "utilization",
      label: "Solar utilization",
      baseline: baseline.solar_utilization_pct,
      battery: withBattery.solar_utilization_pct,
      display: "percent",
      goodWhen: "higher",
    },
    {
      key: "soc",
      label: "Final state of charge",
      baseline: baseline.final_soc_pct,
      battery: withBattery.final_soc_pct,
      display: "percent",
    },
  ];

  const energyChart = [
    {
      metric: "Grid import",
      baseline: Number(baseline.grid_import_kwh || 0),
      battery: Number(withBattery.grid_import_kwh || 0),
    },
    {
      metric: "Surplus solar",
      baseline: Number(baseline.remaining_surplus_kwh || 0),
      battery: Number(withBattery.remaining_surplus_kwh || 0),
    },
  ];

  const utilizationChart = [
    {
      metric: "Solar utilization",
      baseline: Number(baseline.solar_utilization_pct || 0),
      battery: Number(withBattery.solar_utilization_pct || 0),
    },
  ];

  return (
    <div className="space-y-6">
      <SolarVaultPageHeader
        icon={GitCompare}
        title="Before and after battery storage"
        description="The saved no-battery baseline against the same stored SolarTwin readings with hourly battery dispatch. Every value is computed by the backend engine."
        actions={
          <Badge variant="info" dot>
            <GitCompare size={11} />
            Baseline preserved
          </Badge>
        }
      />

      <SolarVaultToolbar onRefresh={refresh} refreshing={detailLoading} />

      <SolarVaultState>
        {simulation && comparison && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Grid import avoided"
                value={formatEnergy(savings.grid_reduction_kwh, 2)}
                detail={`${formatPercent(
                  savings.grid_reduction_pct,
                  1
                )} of baseline grid import`}
                icon={PlugZap}
                tone="emerald"
              />
              <StatCard
                label="Solar utilization gain"
                value={formatPercent(savings.solar_utilization_gain_pct, 1)}
                detail={`${formatPercent(
                  baseline.solar_utilization_pct,
                  1
                )} → ${formatPercent(withBattery.solar_utilization_pct, 1)}`}
                icon={Sun}
                tone="forest"
              />
              <StatCard
                label="Surplus reduced"
                value={formatEnergy(savings.surplus_reduction_kwh, 2)}
                detail={`${formatEnergy(
                  withBattery.remaining_surplus_kwh,
                  2
                )} still unabsorbed`}
                icon={BatteryCharging}
                tone="sky"
              />
              <StatCard
                label="Estimated savings"
                value={formatCurrency(savings.estimated_savings)}
                detail={`Flat tariff ₹${formatNumber(
                  savings.tariff_price_per_kwh,
                  2
                )}/kWh`}
                icon={IndianRupee}
                tone="amber"
              />
            </div>

            <Card>
              <CardHeader
                title="Metric-by-metric comparison"
                description="Direct solar consumption is unchanged: the battery only uses surplus that was not already allocated to demand. Negative deltas are reductions."
                icon={GitCompare}
                action={
                  <Badge variant="forest" dot>
                    {formatUtcDate(simulation.period_start)} –{" "}
                    {formatUtcDate(simulation.period_end)}
                  </Badge>
                }
              />
              <CardBody className="pt-1">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-2.5 pr-3 font-medium">Metric</th>
                        <th className="py-2.5 pr-3 font-medium">
                          Without battery
                        </th>
                        <th className="py-2.5 pr-3 font-medium">
                          With battery
                        </th>
                        <th className="py-2.5 pr-3 font-medium">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const before = Number(row.baseline || 0);
                        const after = Number(row.battery || 0);
                        const delta = after - before;
                        const displayValue = (value) =>
                          row.display === "percent"
                            ? formatPercent(value, 2)
                            : formatEnergy(value, 2);
                        return (
                          <tr
                            key={row.key}
                            className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70"
                          >
                            <td className="py-2.5 pr-3 font-medium text-slate-700">
                              {row.label}
                            </td>
                            <td className="py-2.5 pr-3 text-slate-600">
                              {displayValue(before)}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold text-slate-800">
                              {displayValue(after)}
                            </td>
                            <td
                              className={`py-2.5 pr-3 font-medium ${deltaTone(
                                delta,
                                row.goodWhen
                              )}`}
                            >
                              {row.display === "percent"
                                ? signedPercentPoints(delta)
                                : signedEnergy(delta)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Grid import and surplus"
                  description="Storage moves surplus solar into later unmet demand, lowering both grid import and wasted surplus."
                  icon={PlugZap}
                />
                <CardBody className="pt-1">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={energyChart}
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
                          dataKey="battery"
                          name="With battery"
                          fill="#166534"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Solar utilization"
                  description="Share of generated solar that serves on-site demand directly or through the battery."
                  icon={Sun}
                />
                <CardBody className="pt-1">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={utilizationChart}
                        margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                          vertical={false}
                        />
                        <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          width={44}
                          domain={[0, 100]}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip
                          content={
                            <ChartTooltip
                              valueFormatter={(value) =>
                                formatPercent(value, 2)
                              }
                            />
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} iconSize={9} />
                        <Bar
                          dataKey="baseline"
                          name="Without battery"
                          fill="#94a3b8"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="battery"
                          name="With battery"
                          fill="#0ea5e9"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Savings and storage assumptions"
                  description="Savings apply the same stored tariff to every avoided grid kWh."
                  icon={Sparkles}
                  action={
                    <Badge
                      variant={simulation.conservation_ok ? "success" : "danger"}
                      dot
                    >
                      {simulation.conservation_ok
                        ? "Reconciled"
                        : "Check failed"}
                    </Badge>
                  }
                />
                <CardBody className="grid gap-x-6 gap-y-2.5 pt-1 text-xs md:grid-cols-2">
                  <SolarVaultInfoRow
                    label="Baseline grid import"
                    value={formatEnergy(baseline.grid_import_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="With-battery grid import"
                    value={formatEnergy(withBattery.grid_import_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Grid reduction"
                    value={formatEnergy(savings.grid_reduction_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Grid reduction percentage"
                    value={formatPercent(savings.grid_reduction_pct, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Baseline surplus"
                    value={formatEnergy(
                      baseline.remaining_surplus_kwh,
                      2
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Remaining surplus"
                    value={formatEnergy(
                      withBattery.remaining_surplus_kwh,
                      2
                    )}
                  />
                  <SolarVaultInfoRow
                    label="Estimated savings"
                    value={formatCurrency(savings.estimated_savings)}
                  />
                  <SolarVaultInfoRow
                    label="Tariff applied"
                    value={`₹${formatNumber(
                      savings.tariff_price_per_kwh,
                      2
                    )}/kWh`}
                  />
                  <SolarVaultInfoRow
                    label="Battery capacity"
                    value={formatEnergy(simulation.capacity_kwh, 1)}
                  />
                  <SolarVaultInfoRow
                    label="Round-trip losses"
                    value={formatEnergy(simulation.total_losses_kwh, 2)}
                  />
                  <SolarVaultInfoRow
                    label="Final SOC"
                    value={formatPercent(simulation.final_soc_pct, 1)}
                  />
                  <SolarVaultInfoRow
                    label="Algorithm"
                    value={simulation.algorithm_version}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="What the comparison preserves"
                  description="The no-battery baseline is not overwritten."
                  icon={ShieldCheck}
                />
                <CardBody className="space-y-3 pt-1 text-[11px] leading-5 text-slate-600">
                  <div className="flex items-start gap-2">
                    <CheckCircle2
                      size={13}
                      className="mt-0.5 shrink-0 text-emerald-600"
                    />
                    <p>
                      Direct solar consumption is identical in both columns. The
                      battery never competes with apartments for the same solar
                      when it is being charged.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2
                      size={13}
                      className="mt-0.5 shrink-0 text-emerald-600"
                    />
                    <p>
                      Grid import without storage is read from the original
                      energy balance, not reconstructed from the battery run.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2
                      size={13}
                      className="mt-0.5 shrink-0 text-emerald-600"
                    />
                    <p>
                      Stored energy, discharge and losses are reported separately
                      so no flow is counted twice.
                    </p>
                  </div>
                  <div className="flex items-start gap-2 border-t border-slate-100 pt-3">
                    <Info
                      size={13}
                      className="mt-0.5 shrink-0 text-amber-500"
                    />
                    <p>
                      Savings are an operating-energy estimate. Battery capital
                      cost, replacement, degradation and export credits are not
                      included.
                    </p>
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
