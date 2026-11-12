import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";

const TONE = {
  success: {
    icon: CheckCircle2,
    wrapper: "border-emerald-200 bg-white",
    iconClass: "text-emerald-600",
    bar: "bg-emerald-500",
  },
  error: {
    icon: XCircle,
    wrapper: "border-rose-200 bg-white",
    iconClass: "text-rose-600",
    bar: "bg-rose-500",
  },
  warning: {
    icon: AlertTriangle,
    wrapper: "border-amber-200 bg-white",
    iconClass: "text-amber-600",
    bar: "bg-amber-500",
  },
  info: {
    icon: Info,
    wrapper: "border-slate-200 bg-white",
    iconClass: "text-sky-600",
    bar: "bg-sky-500",
  },
};

export default function ToastViewport({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-4 sm:items-end sm:px-6 sm:pb-6"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const tone = TONE[toast.type] || TONE.info;
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border shadow-dropdown ${tone.wrapper}`}
          >
            <span className={`h-full w-1 shrink-0 self-stretch ${tone.bar}`} aria-hidden="true" />
            <span className={`mt-3.5 shrink-0 ${tone.iconClass}`}>
              <Icon size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 py-3 pr-1">
              <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
              {toast.message && (
                <p className="mt-0.5 text-xs leading-5 text-slate-600">
                  {toast.message}
                </p>
              )}
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                {toast.source}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss?.(toast.id)}
              className="mr-2 mt-2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
