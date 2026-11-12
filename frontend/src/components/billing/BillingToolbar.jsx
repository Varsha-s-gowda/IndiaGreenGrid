import { CalendarDays, RefreshCw, RotateCcw } from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { useBilling } from "../../context/BillingContext";
import { formatUtcDate } from "../../lib/formatters";

export default function BillingToolbar({ onRefresh, refreshing = false }) {
  const {
    runOptions,
    selectedRun,
    selectedRunId,
    selectRun,
    month,
    selectMonth,
    latestPeriod,
  } = useBilling();

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[16rem] flex-1">
          <span className="field-label text-xs">Allocation run</span>
          <select
            className="field h-9 text-xs"
            value={selectedRunId || ""}
            onChange={(event) =>
              selectRun(event.target.value ? Number(event.target.value) : null)
            }
            disabled={!runOptions.length}
          >
            {!runOptions.length && <option value="">No saved allocation run</option>}
            {runOptions.map((run) => (
              <option key={run.id} value={run.id}>
                Run #{run.id} · {run.method_label} · {run.date_from} to {run.date_to}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="field-label text-xs">Billing month</span>
          <input
            type="month"
            className="field h-9 w-40 text-xs"
            value={month}
            onChange={(event) => selectMonth(event.target.value)}
          />
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={() => selectMonth("")}
          title="Show the latest issued billing period"
        >
          <RotateCcw size={13} />
          Latest period
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
        {selectedRun && (
          <Badge variant="info" dot>
            {selectedRun.method_label}
          </Badge>
        )}
        {latestPeriod ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <CalendarDays size={12} />
            {latestPeriod.label} · {formatUtcDate(latestPeriod.start)} –{" "}
            {formatUtcDate(latestPeriod.end)} · {latestPeriod.bills} bills
          </span>
        ) : (
          <span className="text-[11px] text-slate-500">
            No issued bills yet. Generate a preview from the Generate bills page.
          </span>
        )}
        {selectedRun && (
          <span className="text-[11px] text-slate-500">
            Algorithm {selectedRun.algorithm_version} · allocated{" "}
            {Number(selectedRun.total_allocated_kwh || 0).toLocaleString("en-IN", {
              maximumFractionDigits: 1,
            })}{" "}
            kWh
          </span>
        )}
      </div>
    </div>
  );
}
