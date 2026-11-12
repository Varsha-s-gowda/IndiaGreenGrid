import {
  Activity,
  ArrowDown,
  BatteryCharging,
  Building2,
  CheckCircle2,
  Gauge,
  Info,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import StatCard from "../../components/ui/StatCard";
import SolarVaultDisclaimer from "../../components/solarvault/SolarVaultDisclaimer";
import SolarVaultPageHeader from "../../components/solarvault/SolarVaultPageHeader";
import SolarVaultState from "../../components/solarvault/SolarVaultState";
import SolarVaultToolbar from "../../components/solarvault/SolarVaultToolbar";
import { useSolarVault } from "../../context/SolarVaultContext";
import {
  formatEnergy,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";

export default function EnergyFlowDashboardPage() {
  const {
    simulation,
    comparison,
    detailLoading,
    refresh,
    disclaimer,
    limitations,
  } = useSolarVault();

  const savings = comparison?.savings || {};

  return (
    <div className="space-y-6">
      <SolarVaultPageHeader
        icon={Activity}
        title="Energy-flow dashboard"
        description="A stage-by-stage view of how stored solar moves through direct use, battery charging, discharge and grid import. Values come from the immutable simulation snapshot."
        actions={
          <Badge variant="forest">
            <BatteryCharging size={11} /> With battery storage
          </Badge>
        }
      />

      <SolarVaultToolbar onRefresh={refresh} refreshing={detailLoading} />

      <SolarVaultState>
        {simulation && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Solar generation"
                value={formatEnergy(simulation.total_solar_generation_kwh, 2)}
                detail="Stored SolarTwin output over the run"
                icon={Sun}
                tone="forest"
              />
              <StatCard
                label="Direct solar use"
                value={formatEnergy(simulation.direct_solar_kwh, 2)}
                detail="Common areas first, then apartments"
                icon={Building2}
                tone="emerald"
              />
              <StatCard
                label="Discharged to demand"
                value={formatEnergy(simulation.total_discharged_kwh, 2)}
                detail={`${formatEnergy(
                  simulation.total_stored_used_kwh,
                  2
                )} drawn from storage`}
                icon={Zap}
                tone="amber"
              />
              <StatCard
                label="Grid import"
                value={formatEnergy(simulation.grid_import_kwh, 2)}
                detail={`${formatEnergy(
                  simulation.baseline_grid_import_kwh,
                  2
                )} without the battery`}
                icon={PlugZap}
                tone="rose"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Solar allocation and storage flow"
                  description="Common areas are served first, apartments receive the remaining solar, only the genuine surplus charges the battery, and discharge serves unmet demand before the grid."
                  icon={Activity}
                  action={
                    <Badge variant="success" dot>
                      {formatUtcDate(simulation.period_start)} –{" "}
                      {formatUtcDate(simulation.period_end)}
                    </Badge>
                  }
                />
                <CardBody>
                  <div className="mx-auto max-w-2xl">
                    <FlowStage
                      icon={Sun}
                      step="1"
                      label="Total solar generation"
                      value={simulation.total_solar_generation_kwh}
                      detail="Rooftop output from the selected SolarTwin run"
                      tone="forest"
                    />

                    <FlowArrow
                      label="Served directly on site"
                      value={simulation.direct_solar_kwh}
                    />

                    <FlowStage
                      icon={Building2}
                      step="2"
                      label="Direct solar consumption"
                      value={simulation.direct_solar_kwh}
                      detail="Common-area demand first, then the remaining solar to apartments"
                      tone="emerald"
                    />

                    <FlowArrow
                      label="Genuine surplus offered to the battery"
                      value={simulation.total_charged_kwh}
                    />

                    <FlowStage
                      icon={BatteryCharging}
                      step="3"
                      label="Battery charging input"
                      value={simulation.total_charged_kwh}
                      detail={`${formatEnergy(
                        simulation.total_stored_gain_kwh,
                        2
                      )} stored · ${formatEnergy(
                        simulation.total_charge_loss_kwh,
                        2
                      )} charge loss`}
                      tone="sky"
                    />

                    <div className="flex flex-col items-center py-1.5">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
                        Time-shifted discharge into unmet demand ·{" "}
                        {formatEnergy(simulation.total_discharged_kwh, 2)}
                      </span>
                      <ArrowDown
                        size={18}
                        className="my-1 text-amber-500"
                        aria-hidden="true"
                      />
                    </div>

                    <FlowStage
                      icon={Zap}
                      step="4"
                      label="Battery discharge"
                      value={simulation.total_discharged_kwh}
                      detail={`${formatEnergy(
                        simulation.total_stored_used_kwh,
                        2
                      )} stored energy used · ${formatEnergy(
                        simulation.total_discharge_loss_kwh,
                        2
                      )} discharge loss`}
                      tone="amber"
                    />

                    <FlowArrow
                      label="Remaining unmet demand imported from the grid"
                      value={simulation.grid_import_kwh}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <FlowStage
                        icon={PlugZap}
                        step="5a"
                        label="Grid import"
                        value={simulation.grid_import_kwh}
                        detail="Demand still unmet after direct solar and battery discharge"
                        tone="amber"
                      />
                      <FlowStage
                        icon={Sparkles}
                        step="5b"
                        label="Remaining surplus"
                        value={simulation.remaining_surplus_kwh}
                        detail="Surplus left after charging and all on-site demand"
                        tone="sky"
                      />
                    </div>
                  </div>
                </CardBody>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader
                    title="Conservation verification"
                    description="Server-side identities that must hold for every simulation."
                    icon={ShieldCheck}
                    action={
                      simulation.conservation_ok ? (
                        <Badge variant="success" dot>
                          Reconciled
                        </Badge>
                      ) : (
                        <Badge variant="danger" dot>
                          Mismatch
                        </Badge>
                      )
                    }
                  />
                  <CardBody className="space-y-0">
                    <DetailRow label="Building demand">
                      {formatEnergy(
                        simulation.total_building_demand_kwh,
                        2
                      )}
                    </DetailRow>
                    <DetailRow label="Direct solar">
                      {formatEnergy(simulation.direct_solar_kwh, 2)}
                    </DetailRow>
                    <DetailRow label="Battery discharge">
                      {formatEnergy(simulation.total_discharged_kwh, 2)}
                    </DetailRow>
                    <DetailRow label="Grid import">
                      {formatEnergy(simulation.grid_import_kwh, 2)}
                    </DetailRow>
                    <DetailRow label="Remaining surplus">
                      {formatEnergy(simulation.remaining_surplus_kwh, 2)}
                    </DetailRow>
                    <DetailRow label="Maximum error">
                      {formatEnergy(
                        simulation.max_conservation_error_kwh,
                        6
                      )}
                    </DetailRow>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Storage impact"
                    description="Backend-calculated changes against the no-battery baseline."
                    icon={Gauge}
                  />
                  <CardBody className="space-y-3">
                    <CoverageBar
                      label="Grid dependency avoided"
                      value={savings.grid_reduction_pct}
                      color="bg-emerald-500"
                    />
                    <CoverageBar
                      label="Baseline solar utilization"
                      value={comparison?.baseline?.solar_utilization_pct}
                      color="bg-slate-400"
                    />
                    <CoverageBar
                      label="With-battery solar utilization"
                      value={comparison?.with_battery?.solar_utilization_pct}
                      color="bg-forest-600"
                    />
                    <div className="border-t border-slate-100 pt-2.5 text-[11px] leading-5 text-slate-600">
                      <p>
                        Surplus reduced by{" "}
                        <span className="font-semibold text-slate-800">
                          {formatEnergy(savings.surplus_reduction_kwh, 2)}
                        </span>
                        . Utilization gain{" "}
                        <span className="font-semibold text-slate-800">
                          {formatPercent(savings.solar_utilization_gain_pct, 1)}
                        </span>
                        .
                      </p>
                    </div>
                  </CardBody>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader
                title="Conservation equations"
                description="The same identities enforced by the Python battery engine."
                icon={CheckCircle2}
                action={
                  <Badge
                    variant={simulation.conservation_ok ? "success" : "danger"}
                    dot
                  >
                    {simulation.conservation_ok
                      ? "All identities hold"
                      : "Check failed"}
                  </Badge>
                }
              />
              <CardBody>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Equation
                    title="Solar generation identity"
                    left="Solar generated"
                    right={`${formatEnergy(
                      simulation.direct_solar_kwh,
                      4
                    )} direct + ${formatEnergy(
                      simulation.total_charged_kwh,
                      4
                    )} charged + ${formatEnergy(
                      simulation.remaining_surplus_kwh,
                      4
                    )} surplus`}
                    total={simulation.total_solar_generation_kwh}
                  />
                  <Equation
                    title="Building demand identity"
                    left="Building demand"
                    right={`${formatEnergy(
                      simulation.direct_solar_kwh,
                      4
                    )} direct + ${formatEnergy(
                      simulation.total_discharged_kwh,
                      4
                    )} discharged + ${formatEnergy(
                      simulation.grid_import_kwh,
                      4
                    )} grid`}
                    total={simulation.total_building_demand_kwh}
                  />
                  <Equation
                    title="Charge conversion"
                    left="Charge input"
                    right={`${formatEnergy(
                      simulation.total_stored_gain_kwh,
                      4
                    )} stored + ${formatEnergy(
                      simulation.total_charge_loss_kwh,
                      4
                    )} loss`}
                    total={simulation.total_charged_kwh}
                  />
                  <Equation
                    title="Discharge conversion"
                    left="Stored energy used"
                    right={`${formatEnergy(
                      simulation.total_discharged_kwh,
                      4
                    )} delivered + ${formatEnergy(
                      simulation.total_discharge_loss_kwh,
                      4
                    )} loss`}
                    total={simulation.total_stored_used_kwh}
                  />
                </div>
                <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
                  Charging energy is diverted from surplus and is never
                  allocated to apartments in the same interval. Stored energy is
                  only discharged into demand that direct solar did not meet, so
                  no energy is counted twice.
                </p>
              </CardBody>
            </Card>

            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sky-900">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-[11px] leading-5">
                A single interval cannot charge and discharge simultaneously.
                The aggregate flow above spans the whole run, so charging and
                discharging both appear even though they occur in different
                hours.
              </p>
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

function FlowStage({ icon: Icon, step, label, value, detail, tone = "forest" }) {
  const tones = {
    forest: "border-forest-200 bg-forest-50/70 text-forest-800",
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
    sky: "border-sky-200 bg-sky-50/70 text-sky-800",
    amber: "border-amber-200 bg-amber-50/70 text-amber-800",
  };

  return (
    <div
      className={`rounded-xl border p-4 shadow-card ${
        tones[tone] || tones.forest
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/80">
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">
                Stage {step}
              </p>
              <p className="text-sm font-semibold">{label}</p>
            </div>
            <p className="text-lg font-semibold tracking-tight">
              {formatEnergy(value, 2)}
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-5 opacity-80">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function FlowArrow({ label, value }) {
  return (
    <div className="flex flex-col items-center py-1.5">
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
        {label} · {formatEnergy(value, 2)}
      </span>
      <ArrowDown size={18} className="my-1 text-forest-500" aria-hidden="true" />
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-xs last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  );
}

function CoverageBar({ label, value, color }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">
          {formatPercent(safe, 1)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

function Equation({ title, left, right, total }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </p>
      <p className="mt-1.5 text-xs font-medium text-slate-800">
        {left}: {formatEnergy(total, 4)}
      </p>
      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">= {right}</p>
    </div>
  );
}
