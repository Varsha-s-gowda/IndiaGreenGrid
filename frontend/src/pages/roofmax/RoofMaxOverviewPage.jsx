import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Gauge,
  Layers,
  PlayCircle,
  Ruler,
  ShieldCheck,
  Sun,
  Target,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import RoofMaxAnalysisState from "../../components/roofmax/RoofMaxAnalysisState";
import RoofMaxDisclaimer from "../../components/roofmax/RoofMaxDisclaimer";
import RoofMaxInfoRow from "../../components/roofmax/RoofMaxInfoRow";
import RoofMaxPageHeader from "../../components/roofmax/RoofMaxPageHeader";
import RoofMaxToolbar from "../../components/roofmax/RoofMaxToolbar";
import { useRoofMax } from "../../context/RoofMaxContext";
import {
  formatCapacity,
  formatCurrency,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";

export default function RoofMaxOverviewPage() {
  const {
    isAdmin,
    analysis,
    configuration,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useRoofMax();

  const monthly = analysis?.demand_profile?.monthly || [];
  const hourly = analysis?.demand_profile?.hour_of_day || [];
  const monthlyChart = monthly.map((row) => ({
    period: row.period,
    demand: Number(row.total_building_demand_kwh || 0),
    generation: Number(row.total_solar_generation_kwh || 0),
  }));
  const hourlyChart = hourly.map((row) => ({
    hour: `${String(row.hour).padStart(2, "0")}:00`,
    demand: Number(row.average_demand_kwh || 0),
    apartment: Number(row.average_apartment_kwh || 0),
    common: Number(row.average_common_kwh || 0),
  }));

  return (
    <div className="space-y-6">
      <RoofMaxPageHeader
        icon={Gauge}
        title="Rooftop solar potential"
        description="Actual stored building demand, roof limits and the capacity needed to cover it. Every energy and money value is calculated by the backend from a completed SolarTwin run."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isAdmin ? "info" : "success"} dot>
              <ShieldCheck size={11} />
              {isAdmin ? "Administrator view" : "Published view"}
            </Badge>
            {isAdmin && (
              <Link to="/roofmax/configuration">
                <Button size="sm">
                  <PlayCircle size={14} />
                  Generate analysis
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <RoofMaxToolbar onRefresh={refresh} refreshing={detailLoading} />

      <RoofMaxAnalysisState>
        {analysis && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Recommended capacity"
                value={formatCapacity(analysis.recommended_capacity_kwp, 2)}
                detail={`${formatNumber(analysis.recommended_panel_count)} panels · ${formatPercent(
                  analysis.recommended_demand_coverage_percentage,
                  1
                )} demand coverage`}
                icon={Target}
                tone="forest"
              />
              <StatCard
                label="Maximum installable"
                value={formatCapacity(analysis.max_installable_capacity_kwp, 2)}
                detail={`${formatNumber(analysis.max_panel_count)} panels fit the configured roof`}
                icon={Ruler}
                tone="sky"
              />
              <StatCard
                label="Capacity needed for demand"
                value={formatCapacity(analysis.required_capacity_kwp, 2)}
                detail="Average daily demand divided by specific daily yield"
                icon={Zap}
                tone="amber"
              />
              <StatCard
                label="Annual generation"
                value={formatEnergy(analysis.recommended_annual_generation_kwh, 2)}
                detail={`${formatEnergy(
                  analysis.recommended_daily_generation_kwh,
                  2
                )} estimated per day`}
                icon={Sun}
                tone="emerald"
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Stored demand and existing solar generation"
                  description="Monthly totals from the selected SolarTwin run. RoofMax annualises this demand; it does not invent readings."
                  icon={CalendarDays}
                />
                <CardBody className="pt-1">
                  {monthlyChart.length ? (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyChart}
                          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            vertical={false}
                          />
                          <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} width={62} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar
                            dataKey="demand"
                            name="Building demand (kWh)"
                            fill="#166534"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="generation"
                            name="Existing solar (kWh)"
                            fill="#f59e0b"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState
                      compact
                      title="No monthly demand profile"
                      description="The selected analysis has no stored monthly demand rows."
                    />
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Roof and panel envelope"
                  description="From the configuration version used by this analysis."
                  icon={Layers}
                />
                <CardBody className="space-y-2.5 pt-1 text-xs">
                  <RoofMaxInfoRow
                    label="Usable roof area"
                    value={`${formatNumber(analysis.configuration?.usable_roof_area_m2 ?? configuration?.usable_roof_area_m2, 2)} m²`}
                  />
                  <RoofMaxInfoRow
                    label="Panel footprint"
                    value={`${formatNumber(
                      analysis.configuration?.panel_length_m,
                      2
                    )} × ${formatNumber(
                      analysis.configuration?.panel_width_m,
                      2
                    )} m`}
                  />
                  <RoofMaxInfoRow
                    label="Panel rating"
                    value={`${formatNumber(
                      analysis.configuration?.panel_capacity_wp,
                      0
                    )} Wp`}
                  />
                  <RoofMaxInfoRow
                    label="Specific daily yield"
                    value={`${formatNumber(
                      analysis.configuration?.specific_daily_yield_kwh_per_kwp,
                      2
                    )} kWh/kWp/day`}
                  />
                  <RoofMaxInfoRow
                    label="Current installed capacity"
                    value={formatCapacity(analysis.current_solar_capacity_kwp, 2)}
                  />
                  <RoofMaxInfoRow
                    label="Existing solar utilisation"
                    value={formatPercent(
                      analysis.existing_solar_utilization_percentage,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Existing apartment coverage"
                    value={formatPercent(
                      analysis.existing_solar_coverage_percentage,
                      1
                    )}
                  />
                </CardBody>
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Average demand by hour of day"
                  description="Daily shape of apartment and common-area demand in the stored run."
                  icon={Building2}
                />
                <CardBody className="pt-1">
                  {hourlyChart.length ? (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={hourlyChart}
                          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="hour"
                            tick={{ fontSize: 9 }}
                            interval={2}
                          />
                          <YAxis tick={{ fontSize: 10 }} width={52} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar
                            dataKey="apartment"
                            name="Apartments (kWh)"
                            fill="#166534"
                            stackId="demand"
                            radius={[0, 0, 0, 0]}
                          />
                          <Bar
                            dataKey="common"
                            name="Common areas (kWh)"
                            fill="#34d399"
                            stackId="demand"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState
                      compact
                      title="No hourly profile"
                      description="Hour-of-day demand is unavailable for this analysis."
                    />
                  )}
                </CardBody>
              </Card>

              <div className="space-y-5">
                <Card>
                  <CardHeader
                    title="Demand baseline"
                    description="Annualised from the stored run period."
                    icon={Zap}
                  />
                  <CardBody className="space-y-2.5 pt-1 text-xs">
                    <RoofMaxInfoRow
                      label="Apartment consumption"
                      value={formatEnergy(
                        analysis.total_apartment_consumption_kwh,
                        2
                      )}
                    />
                    <RoofMaxInfoRow
                      label="Common-area consumption"
                      value={formatEnergy(
                        analysis.total_common_consumption_kwh,
                        2
                      )}
                    />
                    <RoofMaxInfoRow
                      label="Average daily demand"
                      value={formatEnergy(analysis.average_daily_demand_kwh, 2)}
                    />
                    <RoofMaxInfoRow
                      label="Average monthly demand"
                      value={formatEnergy(
                        analysis.average_monthly_demand_kwh,
                        2
                      )}
                    />
                    <RoofMaxInfoRow
                      label="Annualised demand"
                      value={formatEnergy(analysis.annual_demand_kwh, 2)}
                    />
                    <RoofMaxInfoRow
                      label="Demand period"
                      value={`${formatUtcDate(
                        analysis.demand_start_date
                      )} – ${formatUtcDate(analysis.demand_end_date)}`}
                    />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="At a glance"
                    description="The recommendation is limited by the smaller of roof area and demand."
                    icon={Target}
                  />
                  <CardBody className="space-y-2.5 pt-1 text-xs">
                    <RoofMaxInfoRow
                      label="Annual savings"
                      value={formatCurrency(analysis.annual_savings)}
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
                      label="20-year net benefit"
                      value={formatCurrency(analysis.twenty_year_benefit)}
                    />
                    <Link
                      to="/roofmax/recommendation"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-forest-700 hover:text-forest-900"
                    >
                      Open recommendation
                      <ArrowRight size={12} />
                    </Link>
                  </CardBody>
                </Card>
              </div>
            </div>

            <RoofMaxDisclaimer text={disclaimer} limitations={limitations} />
          </>
        )}
      </RoofMaxAnalysisState>
    </div>
  );
}
