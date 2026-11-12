import { Card, CardBody, CardHeader } from "../ui/Card";
import ErrorState from "../ui/ErrorState";
import EmptyState from "../ui/EmptyState";
import Skeleton from "../ui/Skeleton";

export function ChartTooltip({ active, payload, label, unit = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-dropdown">
      {label !== undefined && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {label}
        </p>
      )}
      <div className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <p
            key={entry.dataKey || entry.name}
            className="flex items-center gap-2 text-xs text-slate-700"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color || entry.stroke }}
            />
            <span className="text-slate-500">{entry.name}</span>
            <span className="ml-auto font-semibold">
              {typeof entry.value === "number"
                ? new Intl.NumberFormat("en-IN", {
                    maximumFractionDigits: 2,
                  }).format(entry.value)
                : entry.value}
              {unit}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

export const AXIS_TICK = { fontSize: 10, fill: "#94a3b8" };
export const GRID_STROKE = "#e2e8f0";

export default function ChartCard({
  title,
  description,
  icon,
  action,
  loading = false,
  error = "",
  onRetry,
  empty = false,
  emptyTitle = "No data available",
  emptyDescription = "Data appears once the connected backend returns records.",
  height = "h-72",
  className = "",
  children,
  footer,
}) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
      />
      <CardBody>
        {loading ? (
          <div className={`flex ${height} flex-col justify-end gap-2`}>
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-full w-full" />
          </div>
        ) : error ? (
          <ErrorState
            compact
            title="Data unavailable"
            message={error}
            onRetry={onRetry}
          />
        ) : empty ? (
          <EmptyState
            icon={icon}
            title={emptyTitle}
            description={emptyDescription}
            compact
          />
        ) : (
          <div className={height}>{children}</div>
        )}
      </CardBody>
      {footer && (
        <div className="border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-500">
          {footer}
        </div>
      )}
    </Card>
  );
}
