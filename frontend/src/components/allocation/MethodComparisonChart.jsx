import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartPanel from "../simulation/ChartPanel";
import ChartTooltip from "../simulation/ChartTooltip";
import { formatNumber } from "../../lib/formatters";
import {
  METHOD_META,
  METHOD_ORDER,
  methodColor,
  methodShortLabel,
} from "../../lib/allocation";

export default function MethodComparisonChart({ comparison, loading, error, onRetry }) {
  const fairness = comparison?.fairness_comparison;
  const jainData = METHOD_ORDER.map((method) => ({
    method,
    label: methodShortLabel(method),
    jain: fairness?.jain_index?.[method] ?? null,
    color: methodColor(method),
  }));

  const coverageData = METHOD_ORDER.map((method) => ({
    method,
    label: methodShortLabel(method),
    average: fairness?.average_coverage_percentage?.[method] ?? 0,
    minimum: fairness?.minimum_coverage_percentage?.[method] ?? 0,
    maximum: fairness?.maximum_coverage_percentage?.[method] ?? 0,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartPanel
        title="Jain fairness index by method"
        description="1.0 means perfectly even solar coverage across apartments with positive demand; lower values indicate wider dispersion."
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={!comparison}
        emptyTitle="No comparison yet"
        emptyDescription="Choose a SolarTwin run and date range to compare the three methods."
        height="h-72"
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={jainData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                width={38}
                tickFormatter={(value) => Number(value).toFixed(2)}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(_, payload) =>
                      METHOD_META[payload?.[0]?.payload?.method]?.label
                    }
                    valueFormatter={(value) =>
                      value == null ? "Not applicable" : Number(value).toFixed(3)
                    }
                  />
                }
              />
              <Bar dataKey="jain" name="Jain index" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {jainData.map((entry) => (
                  <Cell key={entry.method} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>

      <ChartPanel
        title="Coverage spread by method"
        description="Average, minimum and maximum apartment solar coverage percentages on identical inputs."
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={!comparison}
        emptyTitle="No coverage data"
        height="h-72"
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={coverageData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                width={42}
                tickFormatter={(value) => `${formatNumber(value, 0)}%`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(_, payload) =>
                      METHOD_META[payload?.[0]?.payload?.method]?.label
                    }
                    valueFormatter={(value) => `${formatNumber(value, 2)}%`}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar
                dataKey="minimum"
                name="Minimum"
                fill="#96cca9"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="average"
                name="Average"
                fill="#2d744c"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="maximum"
                name="Maximum"
                fill="#0e7490"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>
    </div>
  );
}
