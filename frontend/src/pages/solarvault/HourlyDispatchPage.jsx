import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BatteryCharging,
  Building2,
  Gauge,
  PlugZap,
  Sun,
  Zap,
} from "lucide-react";
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
import Badge from "../../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import StatCard from "../../components/ui/StatCard";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import SolarVaultDisclaimer from "../../components/solarvault/SolarVaultDisclaimer";
import SolarVaultPageHeader from "../../components/solarvault/SolarVaultPageHeader";
import SolarVaultState from "../../components/solarvault/SolarVaultState";
import SolarVaultToolbar from "../../components/solarvault/SolarVaultToolbar";
import { useSolarVault } from "../../context/SolarVaultContext";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
  formatUtcHourOnly,
} from "../../lib/formatters";

function utcDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export default function HourlyDispatchPage() {
  const {
    simulation,
    hourly,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useSolarVault();

  const [selectedDay, setSelectedDay] = useState("");

  const days = useMemo(() => {
    const seen = new Set();
    for (const row of hourly) {
      const day = utcDay(row.timestamp);
      if (day) seen.add(day);
    }
    return Array.from(seen).sort();
  }, [hourly]);

  useEffect(() => {
    if (!days.length) {
      setSelectedDay("");
      return;
    }
    if (!selectedDay || !days.includes(selectedDay)) {
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  const dayRows = useMemo(
    () =>
      hourly
        .filter((row) => utcDay(row.timestamp) === selectedDay)
        .sort(
          (left, right) =>
            new Date(left.timestamp).getTime() -
            new Date(right.timestamp).getTime()
        ),
    [hourly, selectedDay]
  );

  const chartData = dayRows.map((row) => ({
    label: formatUtcHourOnly(row.timestamp),
    solar: Number(row.solar_generation_kwh || 0),
    direct: Number(row.direct_solar_kwh || 0),
    charge: Number(row.charge_energy_kwh || 0),
    discharge: Number(row.discharge_energy_kwh || 0),
    grid: Number(row.grid_import_kwh || 0),
    soc: Number(row.soc_percentage || 0),
  }));

  const dayTotals = dayRows.reduce(
    (totals, row) => ({
      solar: totals.solar + Number(row.solar_generation_kwh || 0),
      direct: totals.direct + Number(row.direct_solar_kwh || 0),
      charge: totals.charge + Number(row.charge_energy_kwh || 0),
      discharge: totals.discharge + Number(row.discharge_energy_kwh || 0),
      grid: totals.grid + Number(row.grid_import_kwh || 0),
      baselineGrid:
        totals.baselineGrid + Number(row.baseline_grid_import_kwh || 0),
      surplus: totals.surplus + Number(row.surplus_kwh || 0),
      baselineSurplus:
        totals.baselineSurplus + Number(row.baseline_surplus_kwh || 0),
    }),
    {
      solar: 0,
      direct: 0,
      charge: 0,
      discharge: 0,
      grid: 0,
      baselineGrid: 0,
      surplus: 0,
      baselineSurplus: 0,
    }
  );
  const endSoc = dayRows.length
    ? Number(dayRows[dayRows.length - 1].soc_percentage || 0)
    : 0;

  const tooltipFormatter = (value, entry) =>
    entry?.dataKey === "soc"
      ? formatPercent(value, 1)
      : formatEnergy(value, 2);

  return (
    <div className="space-y-6">
      <SolarVaultPageHeader
        icon={Activity}
        title="Hourly battery dispatch"
        description="Every hourly interval of the selected simulation: solar generation, direct use, charging, discharging, grid import and the state of charge carried into the next hour."
        actions={
          <Badge variant="forest" dot>
            <Gauge size={11} />
            {simulation
              ? `${formatNumber(simulation.hour_count)} stored hours`
              : "Hourly dispatch"}
          </Badge>
        }
      />

      <SolarVaultToolbar onRefresh={refresh} refreshing={detailLoading} />

      <SolarVaultState>
        {simulation && (
          <>
            <Card>
              <CardBody className="flex flex-wrap items-end gap-3 pt-5">
                <label className="min-w-[14rem]">
                  <span className="field-label text-xs">Dispatch day (UTC)</span>
                  <select
                    className="field h-9 text-xs"
                    value={selectedDay}
                    onChange={(event) => setSelectedDay(event.target.value)}
                    disabled={!days.length}
                  >
                    {!days.length && <option value="">No hourly records</option>}
                    {days.map((day) => (
                      <option key={day} value={day}>
                        {formatUtcDate(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-[11px] leading-5 text-slate-500">
                  {formatUtcDate(simulation.period_start)} –{" "}
                  {formatUtcDate(simulation.period_end)} ·{" "}
                  {formatNumber(dayRows.length)} intervals selected
                </div>
              </CardBody>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Solar generated"
                value={formatEnergy(dayTotals.solar, 2)}
                detail="Stored SolarTwin generation for the day"
                icon={Sun}
                tone="forest"
              />
              <StatCard
                label="Direct solar used"
                value={formatEnergy(dayTotals.direct, 2)}
                detail="Common areas first, then apartments"
                icon={Building2}
                tone="emerald"
              />
              <StatCard
                label="Charged into battery"
                value={formatEnergy(dayTotals.charge, 2)}
                detail="Only genuine surplus after direct allocation"
                icon={BatteryCharging}
                tone="sky"
              />
              <StatCard
                label="Discharged to demand"
                value={formatEnergy(dayTotals.discharge, 2)}
                detail="Stored energy delivered to unmet demand"
                icon={Zap}
                tone="amber"
              />
              <StatCard
                label="Grid import"
                value={formatEnergy(dayTotals.grid, 2)}
                detail={`${formatEnergy(
                  dayTotals.baselineGrid,
                  2
                )} without the battery`}
                icon={PlugZap}
                tone="rose"
              />
              <StatCard
                label="SOC at day end"
                value={formatPercent(endSoc, 1)}
                detail={`${formatEnergy(
                  dayTotals.baselineSurplus - dayTotals.surplus,
                  2
                )} surplus absorbed`}
                icon={Gauge}
                tone="forest"
              />
            </div>

            <Card>
              <CardHeader
                title="Charging, discharging and state of charge"
                description="Bars show hourly energy flows in kWh; the line shows the state of charge at the end of each interval. An interval never charges and discharges at the same time."
                icon={Activity}
                action={
                  <Badge variant="info" dot>
                    {formatUtcDate(selectedDay)}
                  </Badge>
                }
              />
              <CardBody className="pt-1">
                {chartData.length ? (
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9 }}
                          interval={1}
                        />
                        <YAxis
                          yAxisId="energy"
                          tick={{ fontSize: 10 }}
                          width={52}
                          label={{
                            value: "kWh",
                            angle: -90,
                            position: "insideLeft",
                            style: { fontSize: 9, fill: "#64748b" },
                          }}
                        />
                        <YAxis
                          yAxisId="soc"
                          orientation="right"
                          domain={[0, 100]}
                          tick={{ fontSize: 10 }}
                          width={42}
                          tickFormatter={(value) => `${value}%`}
                        />
                        <Tooltip
                          content={
                            <ChartTooltip valueFormatter={tooltipFormatter} />
                          }
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10 }}
                          iconSize={9}
                        />
                        <Bar
                          yAxisId="energy"
                          dataKey="solar"
                          name="Solar generation"
                          fill="#bbf7d0"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          yAxisId="energy"
                          dataKey="direct"
                          name="Direct solar"
                          fill="#166534"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          yAxisId="energy"
                          dataKey="charge"
                          name="Charging"
                          fill="#0ea5e9"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          yAxisId="energy"
                          dataKey="discharge"
                          name="Discharging"
                          fill="#f59e0b"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          yAxisId="energy"
                          dataKey="grid"
                          name="Grid import"
                          fill="#f43f5e"
                          radius={[3, 3, 0, 0]}
                        />
                        <Line
                          yAxisId="soc"
                          type="monotone"
                          dataKey="soc"
                          name="State of charge (%)"
                          stroke="#0f172a"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="No records for this day"
                    description="Choose another day from the selector above."
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Hourly accounting"
                description="Source values and battery flows for the selected day. Direct + charge + surplus equals solar generation; direct + discharge + grid import equals building demand."
                icon={BatteryCharging}
                action={
                  <span className="text-[11px] text-slate-500">
                    {formatNumber(dayRows.length)} rows
                  </span>
                }
              />
              <CardBody className="pt-1">
                {dayRows.length ? (
                  <div className="max-h-[32rem] overflow-auto scrollbar-thin">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-3 font-medium">Hour</th>
                          <th className="py-2 pr-3 font-medium">Solar</th>
                          <th className="py-2 pr-3 font-medium">Direct</th>
                          <th className="py-2 pr-3 font-medium">Charge</th>
                          <th className="py-2 pr-3 font-medium">Discharge</th>
                          <th className="py-2 pr-3 font-medium">Grid</th>
                          <th className="py-2 pr-3 font-medium">Surplus</th>
                          <th className="py-2 pr-3 font-medium">SOC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayRows.map((row) => (
                          <tr
                            key={row.id ?? row.timestamp}
                            className="border-b border-slate-100 hover:bg-slate-50/70"
                          >
                            <td className="py-2 pr-3 font-medium text-slate-700">
                              {formatUtcHourOnly(row.timestamp)}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">
                              {formatEnergy(row.solar_generation_kwh, 2)}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">
                              {formatEnergy(row.direct_solar_kwh, 2)}
                            </td>
                            <td className="py-2 pr-3 text-sky-700">
                              {formatEnergy(row.charge_energy_kwh, 2)}
                            </td>
                            <td className="py-2 pr-3 text-amber-700">
                              {formatEnergy(row.discharge_energy_kwh, 2)}
                            </td>
                            <td className="py-2 pr-3 text-rose-700">
                              {formatEnergy(row.grid_import_kwh, 2)}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">
                              {formatEnergy(row.surplus_kwh, 2)}
                            </td>
                            <td className="py-2 pr-3 font-semibold text-slate-800">
                              {formatPercent(row.soc_percentage, 1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="No hourly accounting"
                    description="The selected day has no stored dispatch rows."
                  />
                )}
              </CardBody>
            </Card>

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
