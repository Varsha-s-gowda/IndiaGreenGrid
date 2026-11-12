import { formatEnergy, formatNumber } from "../../lib/formatters";

export default function ChartTooltip({
  active,
  payload,
  label,
  unit = "kWh",
  valueFormatter,
  labelFormatter,
}) {
  if (!active || !payload?.length) return null;

  const heading = labelFormatter ? labelFormatter(label, payload) : label;

  return (
    <div className="min-w-[11rem] rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-dropdown">
      {heading !== undefined && heading !== null && heading !== "" && (
        <p className="text-[11px] font-semibold text-slate-700">{heading}</p>
      )}
      <div className="mt-1.5 space-y-1">
        {payload.map((entry) => {
          const value = valueFormatter
            ? valueFormatter(entry.value, entry)
            : unit === "kWh"
              ? formatEnergy(entry.value, 2)
              : `${formatNumber(entry.value, 1)} ${unit}`;
          return (
            <div
              key={`${entry.dataKey}-${entry.name}`}
              className="flex items-center justify-between gap-5 text-[11px]"
            >
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color || entry.payload?.color }}
                  aria-hidden="true"
                />
                {entry.name}
              </span>
              <span className="font-semibold text-slate-900">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
