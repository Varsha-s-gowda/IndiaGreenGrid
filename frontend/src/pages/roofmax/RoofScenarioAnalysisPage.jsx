import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Info,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
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
} from "../../lib/formatters";

const SCENARIOS = [
  {
    key: "CONSERVATIVE",
    label: "Conservative",
    variant: "warning",
    description:
      "Lower generation yield and a lower effective tariff, with a higher installation cost. Useful as a downside check.",
  },
  {
    key: "STANDARD",
    label: "Standard",
    variant: "success",
    description:
      "The administrator's configured base assumptions. The recommendation is selected under this scenario.",
  },
  {
    key: "OPTIMISTIC",
    label: "Optimistic",
    variant: "info",
    description:
      "Higher generation yield and a higher effective tariff, with a lower installation cost.",
  },
];

export default function RoofScenarioAnalysisPage() {
  const {
    analysis,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useRoofMax();

  const rows = analysis?.scenarios || [];
  const assumptions = analysis?.assumptions || {};
  const scenarioFactors = assumptions.scenario_factors || {};
  const recommendedKwp = Number(analysis?.recommended_capacity_kwp || 0);

  return (
    <div className="space-y-6">
      <RoofMaxPageHeader
        icon={FlaskConical}
        title="Scenario analysis"
        description="How the conservative and optimistic assumption sets change generation, coverage, cost, payback and ROI while keeping the same stored demand, roof, panel geometry and capacity options."
        actions={
          <Badge variant="info" dot>
            <FlaskConical size={11} />
            Sensitivity view
          </Badge>
        }
      />

      <RoofMaxToolbar onRefresh={refresh} refreshing={detailLoading} />

      <RoofMaxAnalysisState>
        {analysis && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {SCENARIOS.map((scenario) => {
                const factors = scenarioFactors[scenario.key] || {};
                const match = rows.find(
                  (row) =>
                    row.scenario_type === scenario.key &&
                    Math.abs(Number(row.capacity_kwp) - recommendedKwp) < 0.01
                );
                return (
                  <Card key={scenario.key}>
                    <CardBody className="pt-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Badge variant={scenario.variant} dot>
                            {scenario.label}
                          </Badge>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            {scenario.description}
                          </p>
                        </div>
                        <ShieldCheck
                          size={18}
                          className="mt-0.5 shrink-0 text-slate-300"
                          aria-hidden="true"
                        />
                      </div>

                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
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

                      {match ? (
                        <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
                          <RoofMaxInfoRow
                            label="Effective tariff"
                            value={`${formatCurrency(
                              match.assumptions?.tariff_price_per_kwh ??
                                analysis.tariff_price_per_kwh
                            )}/kWh`}
                          />
                          <RoofMaxInfoRow
                            label="Installation"
                            value={formatCurrency(match.installation_cost)}
                          />
                          <RoofMaxInfoRow
                            label="Annual savings"
                            value={formatCurrency(match.annual_savings)}
                          />
                          <RoofMaxInfoRow
                            label="Net annual"
                            value={formatCurrency(match.net_annual_savings)}
                          />
                          <RoofMaxInfoRow
                            label="Payback"
                            value={
                              match.payback_period_years === null
                                ? "Not recovered"
                                : `${formatNumber(
                                    match.payback_period_years,
                                    2
                                  )} years`
                            }
                          />
                          <RoofMaxInfoRow
                            label="ROI"
                            value={formatPercent(match.roi_percentage, 1)}
                          />
                        </div>
                      ) : (
                        <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                          The recommended capacity is not present in this scenario
                          set.
                        </p>
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader
                title="What changes between scenarios"
                description="Only these factors move. Demand, roof area, panel dimensions and capacity candidates are identical across all three sets."
                icon={SlidersHorizontal}
              />
              <CardBody className="pt-1">
                <div className="grid gap-4 md:grid-cols-3">
                  <RoofMaxInfoRow
                    label="Conservative yield reduction"
                    value={formatPercent(
                      assumptions.conservative_yield_variation_pct,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Conservative tariff reduction"
                    value={formatPercent(
                      assumptions.conservative_tariff_variation_pct,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Conservative cost increase"
                    value={formatPercent(
                      assumptions.conservative_cost_variation_pct,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Optimistic yield increase"
                    value={formatPercent(
                      assumptions.optimistic_yield_variation_pct,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Optimistic tariff increase"
                    value={formatPercent(
                      assumptions.optimistic_tariff_variation_pct,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Optimistic cost reduction"
                    value={formatPercent(
                      assumptions.optimistic_cost_variation_pct,
                      1
                    )}
                  />
                  <RoofMaxInfoRow
                    label="Standard tariff"
                    value={`${formatCurrency(analysis.tariff_price_per_kwh)}/kWh`}
                  />
                  <RoofMaxInfoRow
                    label="Tariff escalation"
                    value={formatPercent(assumptions.tariff_escalation_pct, 1)}
                  />
                  <RoofMaxInfoRow
                    label="Maintenance escalation"
                    value={formatPercent(
                      assumptions.maintenance_escalation_pct,
                      1
                    )}
                  />
                </div>
              </CardBody>
            </Card>

            {SCENARIOS.map((scenario) => {
              const scenarioRows = rows
                .filter((row) => row.scenario_type === scenario.key)
                .sort((left, right) => left.capacity_kwp - right.capacity_kwp);
              return (
                <Card key={scenario.key}>
                  <CardHeader
                    title={`${scenario.label} capacity options`}
                    description="Every evaluated option for this assumption set, including options that exceed the roof."
                    icon={FlaskConical}
                    action={
                      <Badge variant={scenario.variant} dot>
                        {scenarioRows.length} options
                      </Badge>
                    }
                  />
                  <CardBody className="pt-1">
                    {scenarioRows.length ? (
                      <div className="overflow-x-auto scrollbar-thin">
                        <table className="min-w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                              <th className="py-2 pr-3 font-medium">Option</th>
                              <th className="py-2 pr-3 font-medium">Capacity</th>
                              <th className="py-2 pr-3 font-medium">Feasible</th>
                              <th className="py-2 pr-3 font-medium">Generation</th>
                              <th className="py-2 pr-3 font-medium">Coverage</th>
                              <th className="py-2 pr-3 font-medium">Surplus</th>
                              <th className="py-2 pr-3 font-medium">Grid dependency</th>
                              <th className="py-2 pr-3 font-medium">Installation</th>
                              <th className="py-2 pr-3 font-medium">Net annual</th>
                              <th className="py-2 pr-3 font-medium">Payback</th>
                              <th className="py-2 pr-3 font-medium">ROI</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scenarioRows.map((row) => (
                              <tr
                                key={`${scenario.key}-${row.option_label}`}
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
                                  {row.constraint_note && (
                                    <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-600">
                                      <AlertTriangle size={10} />
                                      {row.constraint_note}
                                    </p>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 font-semibold text-slate-800">
                                  {formatCapacity(row.capacity_kwp, 2)}
                                </td>
                                <td className="py-2.5 pr-3">
                                  {row.is_feasible ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                      <CheckCircle2 size={11} />
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
                                      <AlertTriangle size={11} />
                                      No
                                    </span>
                                  )}
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
                                  {formatPercent(
                                    row.grid_dependency_percentage,
                                    1
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-slate-600">
                                  {formatCurrency(row.installation_cost)}
                                </td>
                                <td className="py-2.5 pr-3 text-slate-600">
                                  {formatCurrency(row.net_annual_savings)}
                                </td>
                                <td className="py-2.5 pr-3 text-slate-600">
                                  {row.payback_period_years === null
                                    ? "Not recovered"
                                    : `${formatNumber(
                                        row.payback_period_years,
                                        2
                                      )} yr`}
                                </td>
                                <td className="py-2.5 pr-3 text-slate-600">
                                  {formatPercent(row.roi_percentage, 1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        title="No options in this scenario"
                        description="Generate a new analysis to populate the assumption set."
                      />
                    )}
                  </CardBody>
                </Card>
              );
            })}

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sky-900">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-[11px] leading-5">
                Scenario analysis is a sensitivity check, not a probability forecast.
                The conservative and optimistic factors are administrator-configured;
                they are not derived from historical weather or tariff data. If the
                conservative case does not recover its cost, treat the investment as
                dependent on the standard or optimistic assumptions.
              </p>
            </div>

            <RoofMaxDisclaimer text={disclaimer} limitations={limitations} />
          </>
        )}
      </RoofMaxAnalysisState>
    </div>
  );
}
