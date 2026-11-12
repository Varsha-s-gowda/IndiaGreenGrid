import { Loader2 } from "lucide-react";
import useMagnetic from "../effects/useMagnetic";
import { usePointerCapability } from "../effects/usePointerCapability";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS = {
  primary:
    "btn-shine bg-forest-800 text-white shadow-sm hover:bg-forest-900 active:bg-forest-950",
  secondary:
    "btn-lift border border-forest-100 bg-forest-50 text-forest-800 hover:border-forest-200 hover:bg-forest-100",
  outline:
    "btn-lift border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800",
};

const SIZES = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
} = {}) {
  return [
    BASE,
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  className = "",
  disabled = false,
  type = "button",
  children,
  onPointerMove,
  onPointerLeave,
  ...props
}) {
  const { finePointer, reducedMotion } = usePointerCapability();
  const magnetic = useMagnetic({
    disabled:
      variant !== "primary" || !finePointer || reducedMotion || disabled || loading,
  });

  function handlePointerMove(event) {
    onPointerMove?.(event);
    magnetic.onPointerMove(event);
  }

  function handlePointerLeave(event) {
    onPointerLeave?.(event);
    magnetic.onPointerLeave(event);
  }

  return (
    <button
      ref={variant === "primary" ? magnetic.ref : undefined}
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
