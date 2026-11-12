import { ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import useModuleStatuses from "../../hooks/useModuleStatuses";
import { MODULES } from "../../lib/modules";
import TiltCard from "../effects/TiltCard";
import Badge from "../ui/Badge";
import Skeleton from "../ui/Skeleton";

function statusBadge(state, module) {
  if (state.loading) return <Badge variant="neutral" dot>Checking</Badge>;
  if (state.error) return <Badge variant="danger" dot>Unavailable</Badge>;
  if (state.status?.available || module.implemented) {
    return <Badge variant="success" dot>Available</Badge>;
  }
  return <Badge variant="warning" dot>Planned</Badge>;
}

export default function ModuleStatusGrid() {
  const { states, reload } = useModuleStatuses();

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {MODULES.map((module) => {
        const state = states[module.key] || { loading: true };
        const Icon = module.icon;
        const statusMessage =
          state.status?.message?.includes("not implemented")
            ? module.tagline
            : state.status?.message || module.tagline;

        return (
          <TiltCard
            key={module.key}
            className="premium-card group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="icon-chip flex h-9 w-9 items-center justify-center rounded-lg border border-forest-100 bg-forest-50 text-forest-700">
                <Icon size={17} aria-hidden="true" />
              </span>
              {statusBadge(state, module)}
            </div>

            <p className="mt-3 text-sm font-semibold text-slate-900">{module.name}</p>

            {state.loading ? (
              <div className="mt-1.5 space-y-1.5">
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-2.5 w-4/5" />
              </div>
            ) : state.error ? (
              <div className="mt-1.5">
                <p className="text-[11px] leading-5 text-rose-600">{state.error}</p>
                <button
                  type="button"
                  onClick={() => reload(module.key)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition hover:text-forest-700"
                >
                  <RefreshCw size={11} /> Retry
                </button>
              </div>
            ) : (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-slate-500">
                {statusMessage}
              </p>
            )}

            <Link
              to={module.route}
              className="mt-3 inline-flex items-center gap-1 self-start text-[11px] font-semibold text-forest-700 transition group-hover:gap-2"
            >
              Open module
              <ArrowRight size={12} />
            </Link>
          </TiltCard>
        );
      })}
    </div>
  );
}
