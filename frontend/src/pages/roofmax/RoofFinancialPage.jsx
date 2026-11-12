import { useMemo } from "react";
import {
  AlertTriangle,
  IndianRupee,
  Info,
  LineChart as LineChartIcon,
  PiggyBank,
  TrendingUp,
  Wallet,
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
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ChartTooltip from "../../components/simulation/ChartTooltip";
import RoofMaxAnalysisState from "../../components/roofmax/RoofMaxAnalysisState";
import RoofMaxDisclaimer from "../../components/roofmax/RoofMaxDisclaimer";
import RoofMaxInfoRow from "../../components/roofmax/RoofMaxInfoRow";
import RoofMaxPageHeader from "../../components/roofmax/RoofMaxPageHeader";
import RoofMaxToolbar from "../../components/roofmax/RoofMaxToolbar";
import { useRoofMax } from "../../context/RoofMaxContext";
import {
  formatCapacity,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";

const SCENARIO_LABELS = {
  CONSERVATIVE: "Conservative",
  STANDARD: "Standard",
  OPTIMISTIC: "Optimistic",
};

export default function RoofFinancialPage() {
  const {
    analysis,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useRoofMax();

  const standardRows = useMemo(
    () =>
      (analysis?.scenarios || [])
        .filter((row) => row.scenario_type === "STANDARD")
        .sort((left, right) => left.capacity_kwp - right.capacity_kwp),
    [analysis]
  );

  const feasibleRows = standardRows.filter((row) => row.is_feasible);

  const costChart = feasibleRows.map((row) => ({
    capacity: formatCapacity(row.capacity_kwp, 1),
    installation: row.installation_cost,
    benefit: row.twenty_year_benefit,
  }));

  const returnChart = feasibleRows
    .filter((row) => row.payback_period_years !== null)
    .map((row) => ({
      capacity: formatCapacity(row.capacity_kwp, 1),
      payback: row.payback_period_years,
      roi: row.roi_percentage,
      netAnnual: row.net_annual_savings,
    }));

  const scenarioRecommended = useMemo(() => {
    const rows = analysis?.scenarios || [];
    return ["CONSERVATIVE", "STANDARD", "OPTIMISTIC"]
      .map((type) => {
        const match = rows.find(
          (row) =>
            row.scenario_type === type &&
            Math.abs(
              Number(row.capacity_kwp) -
                Number(analysis?.recommended_capacity_kwp)
            ) < 0.01
        );
        return match ? { type, row: match } : null;
      })
      .filter(Boolean);
  }, [analysis]);

  const assumptions = analysis?.assumptions || {};

  return (
    <div className="space-y-6">
      <RoofMaxPageHeader
        icon={IndianRupee}
        title="Financial analysis"
        description="Installation, savings, maintenance, payback, horizon benefit and ROI for the recommended system and every standard capacity option. Values come from the backend under the configured tariff and cost assumptions."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
            <AlertTriangle size={11} />
            Estimates, not guaranteed savings
          </span>
        }
      />

      <RoofMaxToolbar onRefresh={refresh} refreshing={detailLoading} />

      <RoofMaxAnalysisState>
        {analysis && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FinancialTile
                label="Installation cost"
                value={formatCurrency(analysis.installation_cost)}
                detail={`${formatCurrency(analysis.cost_per_kwp)} per kWp`}
                icon={Wallet}
              />
              <FinancialTile
                label="Annual savings"
                value={formatCurrency(analysis.annual_savings)}
                detail={`at ${formatCurrency(analysis.tariff_price_per_kwh)}/kWh`}
                icon={PiggyBank}
              />
              <FinancialTile
                label="Net annual savings"
                value={formatCurrency(analysis.net_annual_savings)}
                detail={`after ${formatCurrency(analysis.annual_maintenance_cost)} maintenance`}
                icon={TrendingUp}
              />
              <FinancialTile
                label="Simple payback"
                value={
                  analysis.payback_period_years === null
                    ? "Not recovered"
                    : `${formatNumber(analysis.payback_period_years, 2)} years`
                }
                detail={`${formatPercent(analysis.roi_percentage, 1)} ROI over ${formatNumber(
                  assumptions.long_horizon_years || 20
                )} years`}
                icon={LineChartIcon}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Investment and long-term benefit"
                  description="Standard assumptions for every feasible capacity option. Benefit includes tariff and maintenance escalation over the configured long horizon."
                  icon={TrendingUp}
                />
                <CardBody className="pt-1">
                  {costChart.length ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={costChart}
                          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            vertical={false}
                          />
                          <XAxis dataKey="capacity" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={76} />
                          <Tooltip
                            content={
                              <ChartTooltip
                                valueFormatter={(value) => formatCurrency(value)}
                              />
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar
                            dataKey="installation"
                            name="Installation cost (₹)"
                            fill="#94a3b8"
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            dataKey="benefit"
                            name="20-year benefit (₹)"
                            fill="#166534"
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState
                      compact
                      title="No feasible capacity options"
                      description="Increase the usable roof area or adjust panel dimensions."
                    />
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Recommended system economics"
                  description="Standard assumptions."
                  icon={IndianRupee}
                />
                <CardBody className="space-y-2.5 pt-1 text-xs">
                  <RoofMaxInfoRow
                    label="Capacity"
                    value={formatCapacity(analysis.recommended_capacity_kwp, 2)}
                  />
                  <RoofMaxInfoRow
                    label="Installation cost"
                    value={formatCurrency(analysis.installation_cost)}
                  />
                  <RoofMaxInfoRow
                    label="Annual savings"
                    value={formatCurrency(analysis.annual_savings)}
                  />
                  <RoofMaxInfoRow
                    label="Annual maintenance"
                    value={formatCurrency(analysis.annual_maintenance_cost)}
                  />
                  <RoofMaxInfoRow
                    label="Net annual savings"
                    value={formatCurrency(analysis.net_annual_savings)}
                  />
                  <RoofMaxInfoRow
                    label="Simple payback"
                    value={
                      analysis.payback_period_years === null
                        ? "Not recovered"
                        : `${formatNumber(analysis.payback_period_years, 2)} years`
                    }
                  />
                  <RoofMaxInfoRow
                    label={`${formatNumber(assumptions.short_horizon_years || 10)}-year benefit`}
                    value={formatCurrency(analysis.ten_year_benefit)}
                  />
                  <RoofMaxInfoRow
                    label={`${formatNumber(assumptions.long_horizon_years || 20)}-year benefit`}
                    value={formatCurrency(analysis.twenty_year_benefit)}
                  />
                  <RoofMaxInfoRow
                    label="ROI"
                    value={formatPercent(analysis.roi_percentage, 2)}
                  />
                  <RoofMaxInfoRow
                    label="Cost per kWp"
                    value={formatCurrency(analysis.cost_per_kwp)}
                  />
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Payback and ROI across feasible options"
                description="Payback uses net annual savings; ROI is the long-horizon benefit relative to installation cost."
                icon={LineChartIcon}
              />
              <CardBody className="pt-1">
                {returnChart.length ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={returnChart}
                        margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                          vertical={false}
                        />
                        <XAxis dataKey="capacity" tick={{ fontSize: 10 }} />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 10 }}
                          width={52}
                          label={{ value: "years", angle: -90, position: "insideLeft", fontSize: 10 }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 10 }}
                          width={56}
                          label={{ value: "%", angle: 90, position: "insideRight", fontSize: 10 }}
                        />
                        <Tooltip
                          content={
                            <ChartTooltip
                              valueFormatter={(value, entry) =>
                                entry?.dataKey === "payback"
                                  ? `${formatNumber(value, 2)} years`
                                  : `${formatNumber(value, 1)}%`
                              }
                            />
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="payback"
                          name="Payback (years)"
                          stroke="#b45309"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="roi"
                          name="ROI (%)"
                          stroke="#166534"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="No positive payback options"
                    description="Net annual savings are not positive for any feasible option under the current assumptions."
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Scenario range at the recommended capacity"
                description="The same capacity is priced and evaluated under all three assumption sets."
                icon={PiggyBank}
              />
              <CardBody className="pt-1">
                <div className="grid gap-4 md:grid-cols-3">
                  {scenarioRecommended.map(({ type, row }) => (
                    <div
                      key={type}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {SCENARIO_LABELS[type]}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {formatCurrency(row.net_annual_savings)}
                        <span className="ml-1 text-[11px] font-normal text-slate-500">
                          net / year
                        </span>
                      </p>
                      <dl className="mt-3 space-y-2 text-xs">
                        <RoofMaxInfoRow
                          label="Installation"
                          value={formatCurrency(row.installation_cost)}
                        />
                        <RoofMaxInfoRow
                          label="Annual savings"
                          value={formatCurrency(row.annual_savings)}
                        />
                        <RoofMaxInfoRow
                          label="Payback"
                          value={
                            row.payback_period_years === null
                              ? "Not recovered"
                              : `${formatNumber(row.payback_period_years, 2)} years`
                          }
                        />
                        <RoofMaxInfoRow
                          label="20-year benefit"
                          value={formatCurrency(row.twenty_year_benefit)}
                        />
                        <RoofMaxInfoRow
                          label="ROI"
                          value={formatPercent(row.roi_percentage, 1)}
                        />
                      </dl>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Standard capacity options"
                description="Every standard option is evaluated, including options that exceed the roof. Infeasible rows are flagged and excluded from the charts."
                icon={IndianRupee}
              />
              <CardBody className="pt-1">
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3 font-medium">Option</th>
                        <th className="py-2 pr-3 font-medium">Capacity</th>
                        <th className="py-2 pr-3 font-medium">Installation</th>
                        <th className="py-2 pr-3 font-medium">Annual savings</th>
                        <th className="py-2 pr-3 font-medium">Maintenance</th>
                        <th className="py-2 pr-3 font-medium">Net annual</th>
                        <th className="py-2 pr-3 font-medium">Payback</th>
                        <th className="py-2 pr-3 font-medium">10-year</th>
                        <th className="py-2 pr-3 font-medium">20-year</th>
                        <th className="py-2 pr-3 font-medium">ROI</th>
                        <th className="py-2 pr-3 font-medium">₹/kWp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standardRows.map((row) => (
                        <tr
                          key={row.option_label}
                          className={`border-b border-slate-100 ${
                            row.is_recommended ? "bg-forest-50/50" : ""
                          }`}
                        >
                          <td className="py-2.5 pr-3 font-medium text-slate-800">
                            {row.option_label}
                            {row.is_recommended && (
                              <span className="ml-1.5 rounded-full bg-forest-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-forest-800">
                                recommended
                              </span>
                            )}
                            {!row.is_feasible && (
                              <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-600">
                                <AlertTriangle size={10} />
                                Exceeds roof limit
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-800">
                            {formatCapacity(row.capacity_kwp, 2)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.installation_cost)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.annual_savings)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.annual_maintenance_cost)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.net_annual_savings)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {row.payback_period_years === null
                              ? "Not recovered"
                              : `${formatNumber(row.payback_period_years, 2)} yr`}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.ten_year_benefit)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.twenty_year_benefit)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatPercent(row.roi_percentage, 1)}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {formatCurrency(row.cost_per_kwp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sky-900">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-[11px] leading-5">
                Surplus generation is not credited. Payback is a simple
                installation-cost divided by net-annual-savings measure; it is not a
                discounted cash-flow or financing model. Panel degradation, inverter
                replacement, taxes, subsidies and insurance are not included unless
                they are already represented in the configured costs.
              </p>
            </div>

            <RoofMaxDisclaimer text={disclaimer} limitations={limitations} />
          </>
        )}
      </RoofMaxAnalysisState>
    </div>
  );
}

function FinancialTile({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-forest-100 bg-forest-50 text-forest-700">
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1.5 truncate text-xs text-slate-500" title={detail}>
        {detail}
      </p>
    </div>
  );
}
