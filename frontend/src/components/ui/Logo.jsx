import { Sun } from "lucide-react";

export default function Logo({ size = "md", showText = true, className = "" }) {
  const square = size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  const iconSize = size === "sm" ? 17 : 21;

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span
        className={`flex shrink-0 items-center justify-center bg-forest-800 text-white shadow-sm ${square}`}
      >
        <Sun size={iconSize} strokeWidth={2.2} aria-hidden="true" />
      </span>
      {showText && (
        <span className="min-w-0">
          <span className="block text-sm font-semibold tracking-tight text-slate-900">
            India Green Grid
          </span>
          <span className="block text-[11px] text-slate-500">
            Clean energy decision support
          </span>
        </span>
      )}
    </span>
  );
}
