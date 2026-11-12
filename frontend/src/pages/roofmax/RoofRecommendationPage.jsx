import { Link } from "react-router-dom";
import {
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  IndianRupee,
  Layers,
  Ruler,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Zap,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import StatCard from "../../components/ui/StatCard";
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

export default function RoofRecommendationPage() {
  const {
    analysis,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useRoofMax();

  const standardRecommended =
    analysis?.scenarios?.find(
      (row) => row.scenario_type === "STANDARD" && row.is_recommended
    ) || null;
  const assumptions = analysis?.assumptions || {};
  const configuration = analysis?.configuration || null;

  return (
    <div className="space-y-6">
      <RoofMaxPageHeader
        icon={Target}
        title="Capacity recommendation"
        description="A single recommendation selected by the backend from every discrete panel layout that fits the roof. It maximises 20-year net gain after investment and falls back to demand coverage when financial returns are not positive."
        actions={
          <Badge variant="forest" dot>
            <Sparkles size={11} />
            Backend-selected
          </Badge>
        }
      />

      <RoofMaxToolbar onRefresh={refresh} refreshing={detailLoading} />

      <RoofMaxAnalysisState>
        {analysis && (
          <>
            <Card className="overflow-hidden">
              <div className="border-b border-forest-100 bg-gradient-to-br from-forest-50 via-white to-emerald-50/60 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-forest-200 bg-white text-forest-700 shadow-sm">
                      <Target size={26} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest-700">
                        Recommended rooftop system
                      </p>
                      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                        {formatCapacity(analysis.recommended_capacity_kwp, 2)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(analysis.recommended_panel_count)} panels ·{" "}
                        {formatCapacity(analysis.max_installable_capacity_kwp, 2)}{" "}
                        maximum under the configured roof
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="success" dot>
                      <CheckCircle2 size={11} />
                      Within roof limit
                    </Badge>
                    <Badge variant="info">
                      {formatPercent(
                        analysis.recommended_demand_coverage_percentage,
                        1
                      )}{" "}
                      demand coverage
                    </Badge>
                  </div>
                </div>
              </div>
              <CardBody className="space-y-4 pt-4">
                <p className="text-sm leading-6 text-slate-700">
                  {analysis.recommendation_reason}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Capacity for average demand
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCapacity(analysis.required_capacity_kwp, 2)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Roof maximum
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCapacity(analysis.max_installable_capacity_kwp, 2)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Recommended
                    </p>
                    <p className="mt-1 text-lg font-semibold text-forest-800">
                      {formatCapacity(analysis.recommended_capacity_kwp, 2)}
                    </p>
                  </div>
                </div>
                {standardRecommended?.constraint_note && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
                    {standardRecommended.constraint_note}
                  </p>
                )}
              </CardBody>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Annual generation"
                value={formatEnergy(analysis.recommended_annual_generation_kwh, 2)}
                detail={`${formatEnergy(
                  analysis.recommended_monthly_generation_kwh,
                  2
                )} average per month`}
                icon={Sun}
                tone="emerald"
              />
              <StatCard
                label="Self-consumed solar"
                value={
                  standardRecommended
                    ? formatEnergy(standardRecommended.self_consumed_kwh, 2)
                    : "—"
                }
                detail={`${formatPercent(
                  analysis.recommended_demand_coverage_percentage,
                  1
                )} of annual building demand`}
                icon={Zap}
                tone="forest"
              />
              <StatCard
                label="Surplus generation"
                value={formatEnergy(analysis.recommended_surplus_kwh, 2)}
                detail="No export credit is assumed"
                icon={BatteryCharging}
                tone="amber"
              />
              <StatCard
                label="Remaining grid dependency"
                value={formatEnergy(analysis.recommended_grid_dependency_kwh, 2)}
                detail={`${formatPercent(
                  analysis.recommended_grid_dependency_percentage,
                  1
                )} of annual demand`}
                icon={Layers}
                tone="sky"
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Energy estimate"
                  description="Annual values derived from the configured daily yield."
                  icon={Sun}
                />
                <CardBody className="space-y-2.5 pt-1 text-xs">
                  <RoofMaxInfoRow
                    label="Specific daily yield"
                    value={`${formatNumber(
                      assumptions.specific_daily_yield_kwh_per_kwp,
                      3
                    )} kWh/kWp/day`}
                  />
                  <RoofMaxInfoRow
                    label="Estimated daily generation"
                    value={formatEnergy(
                      analysis.recommended_daily_generation_kwh,
                      2
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Estimated monthly generation"
                    value={formatEnergy(
                      analysis.recommended_monthly_generation_kwh,
                      2
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Estimated annual generation"
                    value={formatEnergy(
                      analysis.recommended_annual_generation_kwh,
                      2
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Demand coverage"
                    value={formatPercent(
                      analysis.recommended_demand_coverage_percentage,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Grid dependency"
                    value={formatPercent(
                      analysis.recommended_grid_dependency_percentage,
                      1
                    )}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Roof constraint and panel layout"
                  description="The optimiser scans each panel count from one to the maximum that fits."
                  icon={Ruler}
                />
                <CardBody className="space-y-2.5 pt-1 text-xs">
                  <RoofMaxInfoRow
                    label="Usable roof area"
                    value={`${formatNumber(
                      configuration?.usable_roof_area_m2,
                      2
                    )} m²`}
                  />
                  <RoofMaxInfoRow
                    label="Panel footprint"
                    value={`${formatNumber(
                      configuration?.panel_length_m,
                      2
                    )} × ${formatNumber(
                      configuration?.panel_width_m,
                      2
                    )} m = ${formatNumber(configuration?.panel_area_m2, 3)} m²`}
                  />
                  <RoofMaxInfoRow
                    label="Panel rating"
                    value={`${formatNumber(
                      configuration?.panel_capacity_wp,
                      0
                    )} Wp`}
                  />
                  <RoofMaxInfoRow
                    label="Maximum panels"
                    value={formatNumber(analysis.max_panel_count)}
                  />
                  <RoofMaxInfoRow
                    label="Recommended panels"
                    value={formatNumber(analysis.recommended_panel_count)}
                  />
                  <RoofMaxInfoRow
                    label="Current installed capacity"
                    value={formatCapacity(analysis.current_solar_capacity_kwp, 2)}
                  />
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Financial snapshot"
                description="Standard assumptions only. Open Financial for scenario ranges and Scenario analysis for assumption sensitivity."
                icon={IndianRupee}
                action={
                  <Link to="/roofmax/financial">
                    <Button variant="outline" size="sm">
                      Financial analysis
                      <ArrowRight size={13} />
                    </Button>
                  </Link>
                }
              />
              <CardBody className="grid gap-4 pt-1 sm:grid-cols-2 xl:grid-cols-4">
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
                  label="10-year benefit"
                  value={formatCurrency(analysis.ten_year_benefit)}
                />
                <RoofMaxInfoRow
                  label="20-year benefit"
                  value={formatCurrency(analysis.twenty_year_benefit)}
                />
                <RoofMaxInfoRow
                  label="ROI (20 years)"
                  value={formatPercent(analysis.roi_percentage, 2)}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Tariff and provenance"
                description="The analysis is reproducible from its inputs, tariff source and algorithm version."
                icon={ShieldCheck}
              />
              <CardBody className="grid gap-2.5 pt-1 text-xs sm:grid-cols-2 xl:grid-cols-3">
                <RoofMaxInfoRow
                  label="Tariff used"
                  value={`${formatCurrency(analysis.tariff_price_per_kwh)}/kWh`}
                />
                <RoofMaxInfoRow
                  label="Tariff source"
                  value={String(assumptions.tariff_source || "—").replaceAll(
                    "_",
                    " "
                  )}
                />
                <RoofMaxInfoRow
                  label="Tariff effective from"
                  value={
                    assumptions.tariff_effective_from
                      ? formatUtcDate(assumptions.tariff_effective_from)
                      : configuration?.tariff_override_per_kwh
                        ? "Configuration override"
                        : "—"
                  }
                />
                <RoofMaxInfoRow
                  label="Demand period"
                  value={`${formatUtcDate(analysis.demand_start_date)} – ${formatUtcDate(
                    analysis.demand_end_date
                  )}`}
                />
                <RoofMaxInfoRow
                  label="Analysis code"
                  value={analysis.analysis_code}
                />
                <RoofMaxInfoRow
                  label="Input hash"
                  value={`${String(analysis.input_hash).slice(0, 12)}…`}
                />
                <RoofMaxInfoRow
                  label="Algorithm version"
                  value={analysis.algorithm_version}
                />
                <RoofMaxInfoRow
                  label="Created"
                  value={formatUtcDate(analysis.created_at)}
                />
                <RoofMaxInfoRow
                  label="Status"
                  value={analysis.status}
                />
              </CardBody>
            </Card>

            <RoofMaxDisclaimer text={disclaimer} limitations={limitations} />
          </>
        )}
      </RoofMaxAnalysisState>
    </div>
  );
}
