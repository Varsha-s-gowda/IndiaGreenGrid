import { Info, ListChecks } from "lucide-react";

export default function RoofMaxDisclaimer({
  text,
  limitations = [],
  className = "",
}) {
  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-[11px] leading-5">
          {text ||
            "RoofMax results are planning estimates produced from stored SolarTwin demand and the assumptions configured in PostgreSQL. They are not a guaranteed generation forecast, a binding quotation or a guarantee of financial savings."}
        </p>
      </div>

      {limitations.length > 0 && (
        <details className="mt-2 pl-7 text-[11px] leading-5">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-amber-900/90">
            <ListChecks size={12} aria-hidden="true" />
            Assumptions and estimation limits ({limitations.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {limitations.map((item) => (
              <li key={String(item)}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
