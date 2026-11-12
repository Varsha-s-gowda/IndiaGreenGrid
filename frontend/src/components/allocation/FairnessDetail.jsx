import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Gauge,
  Info,
  ListChecks,
  Scale,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Badge from "../ui/Badge";
import { Card, CardBody, CardHeader } from "../ui/Card";
import StatCard from "../ui/StatCard";
import ChartPanel from "../simulation/ChartPanel";
import ChartTooltip from "../simulation/ChartTooltip";
import {
  formatEnergy,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";

const BUCKET_COLORS = [
  "#cbd5e1",
  "#96cca9",
  "#3d8f60",
  "#2d744c",
  "#0e7490",
  "#1e293b",
];

export default function FairnessDetail({ fairness, methodLabel, className = "" }) {
  if (!fairness) return null;

  const distribution = fairness.coverage_distribution || [];
  const chartData = distribution.map((bucket, index) => ({
    ...bucket,
    color: BUCKET_COLORS[index] || "#94a3b8",
  }));

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  Jain fairness index
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
                  {fairness.jain_index == null
                    ? "N/A"
                    : fairness.jain_index.toFixed(4)}
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-forest-100 bg-forest-50 text-forest-700">
                <Gauge size={18} />
              </span>
            </div>
            <div className="mt-3">
              <Badge
                variant={
                  !fairness.jain_index_applicable
                    ? "neutral"
                    : fairness.jain_index >= 0.95
                      ? "success"
                      : fairness.jain_index >= 0.85
                        ? "warning"
                        : "danger"
                }
                dot
              >
                {fairness.jain_index_applicable
                  ? "Applicable to this run"
                  : "Not applicable"}
              </Badge>
            </div>
            <p className="mt-3 text-xs leading-6 text-slate-600">
              {fairness.jain_index_reason ||
                fairness.metric_definition ||
                "Jain's index measures how evenly solar coverage is shared."}
            </p>
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">
              <span className="font-medium text-slate-700">Formula:</span> (Σx)²
              / (n · Σx²), where x is the solar coverage percentage of each
              apartment with positive demand.
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <StatCard
            label="Average coverage"
            value={formatPercent(fairness.average_coverage_percentage)}
            detail={`${formatNumber(fairness.positive_demand_apartments)} apartments with demand`}
            icon={TrendingUp}
            tone="forest"
          />
          <StatCard
            label="Coverage range"
            value={`${formatPercent(fairness.minimum_coverage_percentage)} – ${formatPercent(fairness.maximum_coverage_percentage)}`}
            detail="Minimum to maximum apartment coverage"
            icon={Scale}
            tone="sky"
          />
          <StatCard
            label="Coverage variance"
            value={formatNumber(fairness.coverage_variance, 3)}
            detail={`Standard deviation ${formatPercent(fairness.coverage_standard_deviation, 2)}`}
            icon={Activity}
            tone="amber"
          />
          <StatCard
            label="Allocation variance"
            value={`${formatNumber(fairness.allocation_variance_kwh, 1)} kWh²`}
            detail={`${formatEnergy(fairness.total_solar_allocation_kwh, 1)} allocated in total`}
            icon={BarChart3}
            tone="slate"
          />
          <StatCard
            label="Overall coverage"
            value={formatPercent(fairness.overall_coverage_percentage)}
            detail={`${formatPercent(fairness.total_consumption_kwh ? (fairness.total_solar_allocation_kwh / fairness.total_consumption_kwh) * 100 : 0)} of apartment demand`}
            icon={Gauge}
            tone="emerald"
          />
          <StatCard
            label="Savings pool"
            value={`₹${formatNumber(fairness.savings_distribution?.total_estimated_credit || 0, 0)}`}
            detail={`At ₹${formatNumber(fairness.tariff_price_per_kwh, 2)}/kWh`}
            icon={CircleDollarSign}
            tone="forest"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Coverage distribution"
          description={
            methodLabel
              ? `How ${methodLabel} spreads solar coverage across apartments.`
              : "How solar coverage is spread across apartments."
          }
          icon={BarChart3}
          empty={!chartData.some((bucket) => bucket.count > 0)}
          emptyTitle="No positive-demand apartments"
          height="h-72"
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={52}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      unit="apartments"
                      valueFormatter={(value, entry) =>
                        `${formatNumber(value)} apartments · ${formatNumber(entry?.payload?.share_percentage, 1)}%`
                      }
                    />
                  }
                />
                <Bar dataKey="count" name="Apartments" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {chartData.map((bucket) => (
                    <Cell key={bucket.label} fill={bucket.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>

        <Card>
          <CardHeader
            title="Savings distribution"
            description={
              fairness.savings_distribution
                ? `${formatNumber(fairness.savings_distribution.zero_credit_apartments?.length || 0)} flats received no estimated credit.`
                : "Estimated tariff credit per apartment."
            }
            icon={CircleDollarSign}
          />
          <CardBody className="space-y-3">
            {fairness.savings_distribution ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <MiniMetric
                    label="Average credit"
                    value={`₹${formatNumber(fairness.savings_distribution.average_credit, 0)}`}
                  />
                  <MiniMetric
                    label="Credit variance"
                    value={formatNumber(fairness.savings_distribution.credit_variance, 1)}
                  />
                  <MiniMetric
                    label="Minimum credit"
                    value={`₹${formatNumber(fairness.savings_distribution.minimum_credit, 0)}`}
                  />
                  <MiniMetric
                    label="Maximum credit"
                    value={`₹${formatNumber(fairness.savings_distribution.maximum_credit, 0)}`}
                  />
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Top credit earners
                  </p>
                  <div className="space-y-1.5">
                    {(fairness.savings_distribution.top_earners || []).map((row) => (
                      <div
                        key={row.apartment_id}
                        className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="font-medium text-slate-700">
                          {row.flat_number}
                        </span>
                        <span className="text-slate-500">
                          {formatPercent(row.solar_coverage_percentage)}
                        </span>
                        <span className="font-semibold text-slate-900">
                          ₹{formatNumber(row.estimated_solar_credit, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                No savings distribution was returned for this run.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BenefitTable
          title="Highest solar coverage"
          description="Apartments receiving the largest share of their demand from solar."
          icon={ArrowUpRight}
          rows={fairness.highest_benefited_apartments || []}
        />
        <BenefitTable
          title="Lowest solar coverage"
          description="Apartments receiving the smallest share of their demand from solar."
          icon={ArrowDownRight}
          rows={fairness.lowest_benefited_apartments || []}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Fairness concepts"
            description="Definitions applied by the backend fairness engine."
            icon={Info}
          />
          <CardBody className="space-y-3">
            {(fairness.concepts || []).map((concept) => (
              <div key={concept.key}>
                <p className="text-xs font-semibold text-slate-800">
                  {concept.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                  {concept.explanation}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Interpretation and caveats"
            description="Read these before treating any method as the fairest choice."
            icon={ShieldAlert}
          />
          <CardBody className="space-y-3">
            <p className="text-xs leading-6 text-slate-600">
              {fairness.interpretation}
            </p>
            <ul className="space-y-2">
              {(fairness.caveats || []).map((caveat) => (
                <li
                  key={caveat}
                  className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"
                >
                  <ListChecks
                    size={13}
                    className="mt-0.5 shrink-0 text-forest-600"
                  />
                  {caveat}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function BenefitTable({ title, description, icon, rows }) {
  return (
    <Card>
      <CardHeader title={title} description={description} icon={icon} />
      <CardBody className="px-0 pb-0">
        {!rows.length ? (
          <p className="px-5 pb-5 text-xs text-slate-500">
            No apartment rows were returned.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-semibold">Flat</th>
                  <th className="px-3 py-2 text-right font-semibold">Consumption</th>
                  <th className="px-3 py-2 text-right font-semibold">Solar</th>
                  <th className="px-3 py-2 text-right font-semibold">Coverage</th>
                  <th className="px-5 py-2 text-right font-semibold">Credit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.apartment_id} className="border-t border-slate-100">
                    <td className="px-5 py-2 font-medium text-slate-800">
                      {row.flat_number}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatNumber(row.consumption_kwh, 1)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatNumber(row.solar_allocation_kwh, 1)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {formatPercent(row.solar_coverage_percentage)}
                    </td>
                    <td className="px-5 py-2 text-right font-semibold text-slate-900">
                      ₹{formatNumber(row.estimated_solar_credit, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
