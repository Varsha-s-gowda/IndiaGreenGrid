import { Link } from "react-router-dom";
import {
  BatteryCharging,
  CalendarDays,
  History,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { useSolarVault } from "../../context/SolarVaultContext";
import {
  formatEnergy,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";

const STATUS_VARIANTS = {
  PUBLISHED: "success",
  DRAFT: "warning",
};

export default function SolarVaultToolbar({
  onRefresh,
  refreshing = false,
  showSimulationSelect = true,
  showConfigurationLink = true,
}) {
  const {
    isAdmin,
    runOptions,
    selectedRunId,
    selectedRun,
    selectRun,
    requestedSimulationId,
    selectSimulation,
    history,
    simulation,
    runsLoading,
  } = useSolarVault();

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[15rem] flex-1">
          <span className="field-label text-xs">SolarTwin run</span>
          <select
            className="field h-9 text-xs"
            value={selectedRunId || ""}
            onChange={(event) =>
              selectRun(event.target.value ? Number(event.target.value) : null)
            }
            disabled={!runOptions.length || runsLoading}
          >
            {!runOptions.length && <option value="">No completed run</option>}
            {runOptions.map((run) => (
              <option key={run.id} value={run.id}>
                Run #{run.id} · {formatUtcDate(run.start_date)} to{" "}
                {formatUtcDate(run.end_date)} · {run.days} days
              </option>
            ))}
          </select>
        </label>

        {showSimulationSelect && (
          <label className="min-w-[17rem] flex-1">
            <span className="field-label text-xs">Stored simulation</span>
            <select
              className="field h-9 text-xs"
              value={requestedSimulationId || ""}
              onChange={(event) =>
                selectSimulation(
                  event.target.value ? Number(event.target.value) : null
                )
              }
            >
              <option value="">Latest visible simulation</option>
              {history.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.id} · {item.simulation_code} ·{" "}
                  {formatEnergy(item.capacity_kwh, 1)}
                </option>
              ))}
            </select>
          </label>
        )}

        {onRefresh && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={refreshing}
          >
            <RefreshCw size={13} />
            Refresh
          </Button>
        )}

        {showConfigurationLink && isAdmin && (
          <Link to="/solarvault/configuration">
            <Button variant="outline" size="sm">
              <Settings2 size={13} />
              Configuration
            </Button>
          </Link>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        {simulation ? (
          <>
            <Badge
              variant={STATUS_VARIANTS[simulation.status] || "neutral"}
              dot
            >
              {simulation.status === "PUBLISHED" ? (
                <ShieldCheck size={11} />
              ) : (
                <History size={11} />
              )}
              {simulation.status}
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <BatteryCharging size={12} />
              {simulation.simulation_code} ·{" "}
              {formatEnergy(simulation.capacity_kwh, 1)} battery ·{" "}
              {formatPercent(simulation.final_soc_pct, 1)} final SOC
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <CalendarDays size={12} />
              {formatUtcDate(simulation.period_start)} –{" "}
              {formatUtcDate(simulation.period_end)} · {simulation.hour_count}{" "}
              hours
            </span>
            <span className="text-[11px] text-slate-500">
              Algorithm {simulation.algorithm_version}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-slate-500">
            {selectedRun
              ? `Run #${selectedRun.id} selected. Run a simulation to populate SolarVault.`
              : "No completed SolarTwin run is available yet."}
          </span>
        )}
      </div>
    </div>
  );
}
