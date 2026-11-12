import {
  Activity,
  ArrowDown,
  BatteryCharging,
  Building2,
  CheckCircle2,
  Gauge,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Sun,
  Warehouse,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import NoSimulationState from "../../components/simulation/NoSimulationState";
import SimulationTabs from "../../components/simulation/SimulationTabs";
import SimulationToolbar from "../../components/simulation/SimulationToolbar";
import { useSolarTwin } from "../../context/SolarTwinContext";
import useApiData from "../../hooks/useApiData";
import {
  formatCapacity,
  formatEnergy,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";
import { getSimulationSummary } from "../../services/solarTwinService";

export default function EnergyFlowPage() {
  const {
    selectedRun,
    runId,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
  } = useSolarTwin();

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);
  const summary = useApiData(
    () =>
      getSimulationSummary({
        run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    [runId, dateFrom, dateTo],
    { enabled: ready }
  );

  const balance = summary.data?.energy_balance || null;
  const reload = () => summary.reload();

  if (!runsLoading && !selectedRun) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="SolarTwin"
          icon={Activity}
          title="Energy flow"
          description="Trace solar from generation through common areas and apartments to grid import and surplus."
        />
        <SimulationTabs />
        <NoSimulationState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SolarTwin"
        icon={Activity}
        title="Energy flow"
        description="A stage-by-stage view of how stored solar generation is allocated. Values come directly from /api/simulation/summary."
        actions={
          <Badge variant="forest">
            <BatteryCharging size={11} /> No battery storage
          </Badge>
        }
      />
      <SimulationTabs />

      <SimulationToolbar onRefresh={reload} refreshing={summary.loading} />

      {summary.loading && !balance ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index}>
              <CardBody className="space-y-2 pt-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-36" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : summary.error ? (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Energy balance unavailable"
              message={summary.error}
              onRetry={summary.reload}
            />
          </CardBody>
        </Card>
      ) : balance ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total solar generation"
              value={formatEnergy(balance.total_solar_generation_kwh)}
              detail={`${formatCapacity(selectedRun?.solar_capacity_kwp)} installed`}
              icon={Sun}
              tone="forest"
            />
            <StatCard
              label="Solar used on site"
              value={formatEnergy(balance.total_solar_utilized_kwh)}
              detail={`${formatPercent(balance.solar_utilization_percentage)} utilization`}
              icon={ShieldCheck}
              tone="emerald"
            />
            <StatCard
              label="Grid import"
              value={formatEnergy(balance.grid_import_kwh)}
              detail="Demand not covered by solar"
              icon={PlugZap}
              tone="amber"
            />
            <StatCard
              label="Surplus solar"
              value={formatEnergy(balance.surplus_solar_kwh)}
              detail="Generated but not consumed on site"
              icon={Sparkles}
              tone="sky"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Solar allocation flow"
                description="Common areas are served first, then apartments receive the remaining solar."
                icon={Activity}
                action={
                  <Badge variant="success" dot>
                    {formatUtcDate(dateFrom)} – {formatUtcDate(dateTo)}
                  </Badge>
                }
              />
              <CardBody>
                <div className="mx-auto max-w-2xl">
                  <FlowStage
                    icon={Sun}
                    step="1"
                    label="Total solar generation"
                    value={balance.total_solar_generation_kwh}
                    detail={`Rooftop output for the selected ${selectedRun?.days}-day run`}
                    tone="forest"
                  />

                  <FlowArrow
                    label="Directly consumed by common areas"
                    value={balance.common_solar_utilization_kwh}
                  />

                  <FlowStage
                    icon={Warehouse}
                    step="2"
                    label="Common-area solar consumption"
                    value={balance.common_solar_utilization_kwh}
                    detail={`${formatPercent(
                      balance.common_solar_coverage_percentage
                    )} of common-area demand covered by solar`}
                    tone="emerald"
                  />

                  <FlowArrow
                    label="Solar remaining after common areas"
                    value={balance.remaining_solar_after_common_kwh}
                  />

                  <FlowStage
                    icon={Gauge}
                    step="3"
                    label="Remaining available solar"
                    value={balance.remaining_solar_after_common_kwh}
                    detail="Offered to apartment demand before grid import"
                    tone="sky"
                  />

                  <FlowArrow
                    label="Allocated to apartment demand"
                    value={balance.solar_to_apartments_kwh}
                  />

                  <FlowStage
                    icon={Building2}
                    step="4"
                    label="Solar allocated to apartments"
                    value={balance.solar_to_apartments_kwh}
                    detail={`${formatPercent(
                      balance.apartment_solar_coverage_percentage
                    )} of apartment demand covered by solar`}
                    tone="forest"
                  />

                  <FlowArrow
                    label="Unmet demand imported from the grid"
                    value={balance.grid_import_kwh}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <FlowStage
                      icon={PlugZap}
                      step="5a"
                      label="Grid import"
                      value={balance.grid_import_kwh}
                      detail="Remaining building demand drawn from the grid"
                      tone="amber"
                    />
                    <FlowStage
                      icon={Sparkles}
                      step="5b"
                      label="Surplus solar"
                      value={balance.surplus_solar_kwh}
                      detail="Solar remaining after all on-site demand"
                      tone="sky"
                    />
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader
                  title="Balance verification"
                  description="Server-side conservation checks for the selected range."
                  icon={ShieldCheck}
                  action={
                    balance.conservation_ok ? (
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
                  <DetailRow label="Apartment demand">
                    {formatEnergy(balance.total_apartment_consumption_kwh)}
                  </DetailRow>
                  <DetailRow label="Common-area demand">
                    {formatEnergy(balance.total_common_consumption_kwh)}
                  </DetailRow>
                  <DetailRow label="Building demand">
                    {formatEnergy(balance.total_building_demand_kwh)}
                  </DetailRow>
                  <DetailRow label="Solar to common areas">
                    {formatEnergy(balance.common_solar_utilization_kwh)}
                  </DetailRow>
                  <DetailRow label="Solar to apartments">
                    {formatEnergy(balance.solar_to_apartments_kwh)}
                  </DetailRow>
                  <DetailRow label="Total solar utilized">
                    {formatEnergy(balance.total_solar_utilized_kwh)}
                  </DetailRow>
                  <DetailRow label="Conservation error">
                    {formatEnergy(balance.max_conservation_error_kwh, 4)}
                  </DetailRow>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Coverage"
                  description="How much demand solar serves in each area."
                  icon={Gauge}
                />
                <CardBody className="space-y-3">
                  <CoverageBar
                    label="Apartment demand"
                    value={balance.apartment_solar_coverage_percentage}
                    color="bg-forest-600"
                  />
                  <CoverageBar
                    label="Common-area demand"
                    value={balance.common_solar_coverage_percentage}
                    color="bg-emerald-500"
                  />
                  <CoverageBar
                    label="Total solar utilization"
                    value={balance.solar_utilization_percentage}
                    color="bg-sky-500"
                  />
                </CardBody>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader
              title="Conservation equations"
              description="The same identities used by the backend energy-balance engine."
              icon={CheckCircle2}
              action={
                <Badge variant={balance.conservation_ok ? "success" : "danger"} dot>
                  {balance.conservation_ok ? "Both identities hold" : "Check failed"}
                </Badge>
              }
            />
            <CardBody>
              <div className="grid gap-3 lg:grid-cols-2">
                <Equation
                  title="Solar generation identity"
                  left="Solar generated"
                  right={`${formatEnergy(balance.total_solar_utilized_kwh, 4)} utilized + ${formatEnergy(
                    balance.surplus_solar_kwh,
                    4
                  )} surplus`}
                  total={balance.total_solar_generation_kwh}
                />
                <Equation
                  title="Building demand identity"
                  left="Building demand"
                  right={`${formatEnergy(balance.total_solar_utilized_kwh, 4)} solar + ${formatEnergy(
                    balance.grid_import_kwh,
                    4
                  )} grid`}
                  total={balance.total_building_demand_kwh}
                />
              </div>
              <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
                Common areas are served first, apartments receive the remaining solar, and any
                unmet demand is imported from the grid. Battery storage is intentionally excluded
                from this phase, so surplus solar is not stored.
              </p>
            </CardBody>
          </Card>
        </>
      ) : null}
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
    <div className={`rounded-xl border p-4 shadow-card ${tones[tone] || tones.forest}`}>
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
            <p className="text-lg font-semibold tracking-tight">{formatEnergy(value)}</p>
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
        {label} · {formatEnergy(value)}
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
        <span className="font-semibold text-slate-900">{formatPercent(safe)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${safe}%` }} />
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
