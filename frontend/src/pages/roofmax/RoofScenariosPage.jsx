import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  GitCompare,
  Info,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import RoofMaxAnalysisState from "../../components/roofmax/RoofMaxAnalysisState";
import RoofMaxDisclaimer from "../../components/roofmax/RoofMaxDisclaimer";
import RoofMaxPageHeader from "../../components/roofmax/RoofMaxPageHeader";
import RoofMaxToolbar from "../../components/roofmax/RoofMaxToolbar";
import { useRoofMax } from "../../context/RoofMaxContext";
import {
  formatCapacity,
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";

const SCENARIOS = [
  { key: "CONSERVATIVE", label: "Conservative", color: "#b45309" },
  { key: "STANDARD", label: "Standard", color: "#166534" },
  { key: "OPTIMISTIC", label: "Optimistic", color: "#0284c7" },
];

export default function RoofScenariosPage() {
  const {
    analysis,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useRoofMax();
  const [activeScenario, setActiveScenario] = useState("STANDARD");

  const grouped = useMemo(() => {
    const rows = analysis?.scenarios || [];
    const map = new Map();
    for (const row of rows) {
      const key = Number(row.capacity_kwp);
      if (!map.has(key)) {
        map.set(key, {
          capacity_kwp: key,
          option_label: row.option_label,
        });
      }
      map.get(key)[row.scenario_type] = row;
    }
    return [...map.values()].sort((left, right) => left.capacity_kwp - right.capacity_kwp);
  }, [analysis]);

  const generationChart = useMemo(
    () =>
      grouped
        .filter((row) => row.STANDARD?.is_feasible)
        .map((row) => ({
          capacity: formatCapacity(row.capacity_kwp, 1),
          conservative: row.CONSERVATIVE?.annual_generation_kwh ?? null,
          standard: row.STANDARD?.annual_generation_kwh ?? null,
          optimistic: row.OPTIMISTIC?.annual_generation_kwh ?? null,
        })),
    [grouped]
  );

  const savingsChart = useMemo(
    () =>
      grouped
        .filter((row) => row.STANDARD?.is_feasible)
        .map((row) => ({
          capacity: formatCapacity(row.capacity_kwp, 1),
          conservative: row.CONSERVATIVE?.net_annual_savings ?? null,
          standard: row.STANDARD?.net_annual_savings ?? null,
          optimistic: row.OPTIMISTIC?.net_annual_savings ?? null,
        })),
    [grouped]
  );

  const scenarioFactors = analysis?.assumptions?.scenario_factors || {};
  const activeRows = grouped
    .map((row) => row[activeScenario])
    .filter(Boolean)
    .sort((left, right) => left.capacity_kwp - right.capacity_kwp);

  return (
    <div className="space-y-6">
      <RoofMaxPageHeader
        icon={GitCompare}
        title="Capacity scenarios"
        description="Standard, conservative and optimistic results use identical stored demand and panel geometry. Only the yield, tariff and cost factors change, and every option is recalculated by the backend."
        actions={
          <Badge variant="info" dot>
            <GitCompare size={11} />
            Three assumption sets
          </Badge>
        }
      />

      <RoofMaxToolbar onRefresh={refresh} refreshing={detailLoading} />

      <RoofMaxAnalysisState>
        {analysis && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {SCENARIOS.map((scenario) => {
                const factors = scenarioFactors[scenario.key] || {};
                return (
                  <Card key={scenario.key}>
                    <CardBody className="pt-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            {scenario.label}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {scenario.key === "STANDARD"
                              ? "Configured base assumptions"
                              : scenario.key === "CONSERVATIVE"
                                ? "Lower yield and tariff, higher cost"
                                : "Higher yield and tariff, lower cost"}
                          </p>
                        </div>
                        <span
                          className="mt-1 h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: scenario.color }}
                          aria-hidden="true"
                        />
                      </div>
                      <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div className="rounded-lg bg-slate-50 p-2">
                          <dt className="text-slate-500">Yield</dt>
                          <dd className="mt-0.5 font-semibold text-slate-800">
                            ×{formatNumber(factors.yield_factor ?? 1, 3)}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <dt className="text-slate-500">Tariff</dt>
                          <dd className="mt-0.5 font-semibold text-slate-800">
                            ×{formatNumber(factors.tariff_factor ?? 1, 3)}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2">
                          <dt className="text-slate-500">Cost</dt>
                          <dd className="mt-0.5 font-semibold text-slate-800">
                            ×{formatNumber(factors.cost_factor ?? 1, 3)}
                          </dd>
                        </div>
                      </dl>
                    </CardBody>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader
                title="Scenario comparison"
                description={`Recommended ${formatCapacity(
                  analysis.recommended_capacity_kwp,
                  2
                )} · required ${formatCapacity(
                  analysis.required_capacity_kwp,
                  2
                )} · roof maximum ${formatCapacity(
                  analysis.max_installable_capacity_kwp,
                  2
                )}.`}
                icon={GitCompare}
              />
              <CardBody className="pt-1">
                <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.key}
                      type="button"
                      onClick={() => setActiveScenario(scenario.key)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        activeScenario === scenario.key
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {scenario.label}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto scrollbar-thin">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3 font-medium">Option</th>
                        <th className="py-2 pr-3 font-medium">Capacity</th>
                        <th className="py-2 pr-3 font-medium">Panels</th>
                        <th className="py-2 pr-3 font-medium">Generation</th>
                        <th className="py-2 pr-3 font-medium">Coverage</th>
                        <th className="py-2 pr-3 font-medium">Surplus</th>
                        <th className="py-2 pr-3 font-medium">Install cost</th>
                        <th className="py-2 pr-3 font-medium">Annual savings</th>
                        <th className="py-2 pr-3 font-medium">Net annual</th>
                        <th className="py-2 pr-3 font-medium">Payback</th>
                        <th className="py-2 pr-3 font-medium">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRows.map((row) => (
                        <tr
                          key={`${activeScenario}-${row.option_label}`}
                          className={`border-b border-slate-100 ${
                            row.is_recommended ? "bg-forest-50/50" : ""
                          }`}
                        >
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-1.5 font-medium text-slate-800">
                              {row.is_recommended && (
                                <CheckCircle2
                                  size={13}
                                  className="text-forest-700"
                                />
                              )}
                              {row.option_label}
                            </div>
                            {!row.is_feasible && (
                              <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-600">
                                <AlertTriangle size={10} />
                                {row.constraint_note ||
                                  "Exceeds the configured roof limit"}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-800">
                            {formatCapacity(row.capacity_kwp, 2)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatNumber(row.panel_count)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatEnergy(row.annual_generation_kwh, 1)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatPercent(row.demand_coverage_percentage, 1)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatEnergy(row.surplus_kwh, 1)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.installation_cost)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.annual_savings)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.net_annual_savings)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {row.payback_period_years === null
                              ? "Not recovered"
                              : `${formatNumber(row.payback_period_years, 1)} yr`}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatPercent(row.roi_percentage, 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!activeRows.length && (
                  <EmptyState
                    compact
                    title="No rows for this scenario"
                    description="Generate a new analysis to populate the scenario comparison."
                  />
                )}
              </CardBody>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Annual generation by capacity"
                  description="Feasible options only. Higher capacity increases generation, but surplus earns no credit."
                  icon={BarChart3}
                />
                <CardBody className="pt-1">
                  {generationChart.length ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={generationChart}
                          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            vertical={false}
                          />
                          <XAxis dataKey="capacity" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={62} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Line
                            type="monotone"
                            dataKey="conservative"
                            name="Conservative"
                            stroke="#b45309"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="standard"
                            name="Standard"
                            stroke="#166534"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="optimistic"
                            name="Optimistic"
                            stroke="#0284c7"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState compact title="No generation data" />
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Net annual savings by capacity"
                  description="Annual savings minus maintenance under each assumption set."
                  icon={TrendingUp}
                />
                <CardBody className="pt-1">
                  {savingsChart.length ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={savingsChart}
                          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            vertical={false}
                          />
                          <XAxis dataKey="capacity" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={72} />
                          <Tooltip
                            content={
                              <ChartTooltip
                                valueFormatter={(value) => formatCurrency(value)}
                              />
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar
                            dataKey="conservative"
                            name="Conservative"
                            fill="#f59e0b"
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            dataKey="standard"
                            name="Standard"
                            fill="#166534"
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            dataKey="optimistic"
                            name="Optimistic"
                            fill="#0284c7"
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState compact title="No financial data" />
                  )}
                </CardBody>
              </Card>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sky-900">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-[11px] leading-5">
                An option marked infeasible cannot be installed within the configured
                usable roof area. Standard 10/20/30/40/50 kWp options are still
                evaluated so the constraint is explicit, but the recommendation never
                exceeds the roof maximum.
              </p>
            </div>

            <RoofMaxDisclaimer text={disclaimer} limitations={limitations} />
          </>
        )}
      </RoofMaxAnalysisState>
    </div>
  );
}
