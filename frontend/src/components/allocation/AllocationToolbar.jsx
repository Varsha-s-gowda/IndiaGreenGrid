import { CalendarRange, RefreshCw, RotateCcw } from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { useAllocation } from "../../context/AllocationContext";
import { formatCapacity, formatUtcDate } from "../../lib/formatters";

const STATUS_VARIANTS = {
  COMPLETED: "success",
  RUNNING: "info",
  PARTIAL: "warning",
  FAILED: "danger",
  PENDING: "neutral",
};

export default function AllocationToolbar({ onRefresh, refreshing = false }) {
  const {
    runs,
    selectedRun,
    selectRun,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    resetDateRange,
    rangeValid,
  } = useAllocation();

  if (!selectedRun) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[15rem] flex-1">
          <span className="field-label text-xs">SolarTwin run</span>
          <select
            className="field h-9 text-xs"
            value={selectedRun.id}
            onChange={(event) => selectRun(Number(event.target.value))}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                Run #{run.id} · {run.start_date} to {run.end_date} · {run.status}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="field-label text-xs">From (UTC)</span>
          <input
            type="date"
            className="field h-9 w-40 text-xs"
            value={dateFrom}
            min={selectedRun.start_date}
            max={selectedRun.end_date}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>

        <label>
          <span className="field-label text-xs">To (UTC)</span>
          <input
            type="date"
            className="field h-9 w-40 text-xs"
            value={dateTo}
            min={selectedRun.start_date}
            max={selectedRun.end_date}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={resetDateRange}
          title="Reset to the full simulation period"
        >
          <RotateCcw size={13} />
          Full period
        </Button>

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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        <Badge variant={STATUS_VARIANTS[selectedRun.status] || "neutral"} dot>
          {selectedRun.status}
        </Badge>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <CalendarRange size={12} />
          {formatUtcDate(dateFrom || selectedRun.start_date)} –{" "}
          {formatUtcDate(dateTo || selectedRun.end_date)}
        </span>
        <span className="text-[11px] text-slate-500">
          {selectedRun.days} days · {formatCapacity(selectedRun.solar_capacity_kwp)}
        </span>
        <span className="text-[11px] text-slate-500">
          Readings {selectedRun.progress_percentage}% complete
        </span>
        {!rangeValid && (
          <span className="text-[11px] font-medium text-rose-600">
            Select a valid date range.
          </span>
        )}
      </div>
    </div>
  );
}
