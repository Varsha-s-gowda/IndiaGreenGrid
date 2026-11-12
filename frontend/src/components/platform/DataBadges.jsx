import Badge from "../ui/Badge";
import { formatRelativeTime } from "../../lib/formatters";

const STATUS_VARIANTS = {
  fresh: "success",
  stale: "warning",
  unavailable: "danger",
  error: "danger",
  sample: "info",
  configured: "success",
  COMPLIANT: "success",
  AT_RISK: "warning",
  NON_COMPLIANT: "danger",
  NOT_RECORDED: "neutral",
  RECYCLED: "success",
  IN_TRANSIT: "info",
  SCHEDULED: "info",
  LOGGED: "neutral",
  CANCELLED: "danger",
  SUBMITTED: "info",
  ACTIVE: "success",
  INACTIVE: "neutral",
  EXPIRED: "danger",
  VERIFIED: "success",
  VERIFIED_EXTERNAL: "success",
  UNVERIFIED: "warning",
  PENDING: "warning",
  REJECTED: "danger",
  LIVE: "success",
  LIVE_WEATHER: "success",
  ESTIMATED: "info",
  SAMPLE_TEMPLATE: "info",
  UNAVAILABLE: "danger",
  STALE: "warning",
  APPLIED: "success",
  CAPPED_AT_3KW: "info",
  NOT_ELIGIBLE: "neutral",
  STATE_NOT_AVAILABLE: "warning",
  NO_TARGET: "neutral",
  SUCCESS: "success",
  FAILED: "danger",
};

const STATUS_LABELS = {
  AT_RISK: "At risk",
  NON_COMPLIANT: "Non-compliant",
  NOT_RECORDED: "Not recorded",
};

export function labelForToken(value) {
  if (!value) return "—";
  if (STATUS_LABELS[value]) return STATUS_LABELS[value];
  return String(value)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function StatusBadge({ value, className = "" }) {
  return (
    <Badge
      variant={STATUS_VARIANTS[value] || "neutral"}
      className={className}
      dot={Boolean(value)}
    >
      {labelForToken(value)}
    </Badge>
  );
}

export function FreshnessBadge({ item }) {
  if (!item) return null;
  const value =
    item.dataset_status ||
    (item.status === "unavailable" ? "unavailable" : item.freshness);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge value={value || item.status} />
      {item.dataset_status === "SAMPLE" && item.is_demo && (
        <Badge variant="info">Demo</Badge>
      )}
      {item.age_hours !== undefined && item.age_hours !== null && (
        <span className="text-[10px] text-slate-500">
          updated {formatRelativeTime(item.last_retrieved_at)}
        </span>
      )}
    </span>
  );
}

export function SampleNotice({ title = "Sample data", children, tone = "info" }) {
  const styles =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-sky-200 bg-sky-50 text-sky-800";
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 ${styles}`}>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-[11px] font-bold">
        i
      </span>
      <div className="min-w-0 text-[11px] leading-5">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

export function FreshnessStrip({ items = [], compact = false }) {
  if (!items.length) return null;
  return (
    <div
      className={`grid gap-2 sm:grid-cols-2 ${
        compact ? "" : "lg:grid-cols-3 xl:grid-cols-4"
      }`}
    >
      {items.map((item) => (
        <div
          key={item.id || item.code}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-700">
              {item.name || item.code}
            </p>
            <FreshnessBadge item={item} />
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            {item.organization || "Source"} · {item.record_count ?? 0} records
          </p>
        </div>
      ))}
    </div>
  );
}
