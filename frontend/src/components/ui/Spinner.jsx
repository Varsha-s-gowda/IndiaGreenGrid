import { Loader2 } from "lucide-react";
import Logo from "./Logo";

const SIZES = {
  sm: 14,
  md: 18,
  lg: 24,
};

export function Spinner({ size = "md", className = "" }) {
  return (
    <Loader2
      size={SIZES[size] || SIZES.md}
      className={`animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}

export function FullPageLoader({ message = "Loading your workspace…" }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6">
      <Logo size="md" />
      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
        <Spinner size="sm" className="text-forest-700" />
        {message}
      </span>
    </div>
  );
}

export function InlineLoader({ message = "Loading…" }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-500">
      <Spinner size="sm" className="text-forest-700" />
      {message}
    </span>
  );
}
