import { CircleDashed } from "lucide-react";

export default function EmptyState({
  icon: Icon = CircleDashed,
  title,
  description,
  action,
  compact = false,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center ${
        compact ? "py-8" : "py-12"
      } ${className}`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-xs leading-6 text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
