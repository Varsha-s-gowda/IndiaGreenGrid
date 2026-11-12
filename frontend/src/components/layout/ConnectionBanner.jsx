import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Wifi, X } from "lucide-react";
import { useHealth } from "../../context/HealthContext";
import { formatTime } from "../../lib/formatters";

export default function ConnectionBanner() {
  const { status, error, refresh, refreshing, lastChecked } = useHealth();
  const [dismissedStatus, setDismissedStatus] = useState(null);

  useEffect(() => {
    setDismissedStatus(null);
  }, [status]);

  if (status === "checking" || status === "online") return null;
  if (dismissedStatus === status) return null;

  const offline = status === "offline";

  return (
    <div
      className={`border-b ${
        offline
          ? "border-rose-200 bg-rose-50"
          : "border-amber-200 bg-amber-50"
      }`}
      role="status"
    >
      <div className="page-container flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            offline ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
          }`}
        >
          {offline ? <Wifi size={15} /> : <AlertTriangle size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold ${
              offline ? "text-rose-900" : "text-amber-900"
            }`}
          >
            {offline
              ? "Backend API unreachable"
              : "Database health check failing"}
          </p>
          <p
            className={`mt-0.5 text-[11px] leading-5 ${
              offline ? "text-rose-700" : "text-amber-700"
            }`}
          >
            {error ||
              (offline
                ? "Start the FastAPI backend on port 8000 and retry."
                : "The API responds but PostgreSQL is not reachable.")}
            {lastChecked && (
              <span className="ml-1 opacity-80">Last checked {formatTime(lastChecked)}.</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[11px] font-semibold shadow-sm transition disabled:opacity-60 ${
            offline
              ? "border-rose-200 text-rose-700 hover:bg-rose-100"
              : "border-amber-200 text-amber-700 hover:bg-amber-100"
          }`}
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Retrying" : "Retry"}
        </button>
        <button
          type="button"
          onClick={() => setDismissedStatus(status)}
          className={`rounded-md p-1 transition ${
            offline
              ? "text-rose-400 hover:bg-rose-100 hover:text-rose-700"
              : "text-amber-400 hover:bg-amber-100 hover:text-amber-700"
          }`}
          aria-label="Dismiss connection notice"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
