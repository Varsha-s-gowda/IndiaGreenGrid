import { Info } from "lucide-react";

export default function BillingDisclaimer({ text, className = "" }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-amber-900 ${className}`}
    >
      <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-[11px] leading-5">
        {text ||
          "Grid charges are estimated from the society tariff configuration and are not an official BESCOM bill. Solar credits and estimated savings are internal society benefits, not BESCOM credits."}
      </p>
    </div>
  );
}
