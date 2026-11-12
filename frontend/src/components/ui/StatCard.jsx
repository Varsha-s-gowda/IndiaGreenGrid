import TiltCard from "../effects/TiltCard";
import Skeleton from "./Skeleton";

const TONES = {
  forest: "bg-forest-50 text-forest-700 border-forest-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  sky: "bg-sky-50 text-sky-700 border-sky-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  rose: "bg-rose-50 text-rose-700 border-rose-100",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "forest",
  loading = false,
}) {
  if (loading) {
    return (
      <div className="premium-card rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-7 w-28" />
        <Skeleton className="mt-2 h-3 w-36" />
      </div>
    );
  }

  return (
    <TiltCard className="premium-card rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        {Icon && (
          <span
            className={`icon-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              TONES[tone] || TONES.forest
            }`}
          >
            <Icon size={17} aria-hidden="true" />
          </span>
        )}
      </div>
      {detail && (
        <p className="mt-1.5 truncate text-xs text-slate-500" title={detail}>
          {detail}
        </p>
      )}
    </TiltCard>
  );
}
