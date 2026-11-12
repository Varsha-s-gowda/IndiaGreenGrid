import { Link } from "react-router-dom";
import {
  CalendarDays,
  History,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { useRoofMax } from "../../context/RoofMaxContext";
import { formatCapacity, formatUtcDate } from "../../lib/formatters";

export default function RoofMaxToolbar({ onRefresh, refreshing = false }) {
  const {
    isAdmin,
    runOptions,
    selectedRunId,
    selectedRun,
    selectRun,
    requestedAnalysisId,
    selectAnalysis,
    history,
    analysis,
  } = useRoofMax();

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
            disabled={!runOptions.length}
          >
            {!runOptions.length && <option value="">No completed run</option>}
            {runOptions.map((run) => (
              <option key={run.id} value={run.id}>
                Run #{run.id} · {formatUtcDate(run.start_date)} to{" "}
                {formatUtcDate(run.end_date)} · {run.days} days ·{" "}
                {formatCapacity(run.solar_capacity_kwp, 2)}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[16rem] flex-1">
          <span className="field-label text-xs">Stored analysis</span>
          <select
            className="field h-9 text-xs"
            value={requestedAnalysisId || ""}
            onChange={(event) =>
              selectAnalysis(
                event.target.value ? Number(event.target.value) : null
              )
            }
          >
            <option value="">Latest visible analysis</option>
            {history.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} · {item.analysis_code} ·{" "}
                {formatCapacity(item.recommended_capacity_kwp, 1)}
              </option>
            ))}
          </select>
        </label>

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

        {isAdmin && (
          <Link to="/roofmax/configuration">
            <Button variant="outline" size="sm">
              <Settings2 size={13} />
              Configuration
            </Button>
          </Link>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        {analysis ? (
          <>
            <Badge
              variant={analysis.status === "PUBLISHED" ? "success" : "warning"}
              dot
            >
              {analysis.status === "PUBLISHED" ? (
                <ShieldCheck size={11} />
              ) : (
                <History size={11} />
              )}
              {analysis.status}
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <CalendarDays size={12} />
              {analysis.analysis_code} · demand {formatUtcDate(analysis.demand_start_date)}{" "}
              – {formatUtcDate(analysis.demand_end_date)} ·{" "}
              {analysis.demand_days} days
            </span>
            <span className="text-[11px] text-slate-500">
              Algorithm {analysis.algorithm_version}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-slate-500">
            {selectedRun
              ? `Run #${selectedRun.id} selected. Generate a capacity analysis to populate RoofMax.`
              : "No completed SolarTwin run is available yet."}
          </span>
        )}
      </div>
    </div>
  );
}
