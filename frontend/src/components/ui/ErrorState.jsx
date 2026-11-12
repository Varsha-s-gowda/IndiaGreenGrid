import { AlertTriangle, RefreshCw } from "lucide-react";
import Button from "./Button";

export default function ErrorState({
  title = "Something went wrong",
  message = "The request could not be completed. Please try again.",
  onRetry,
  retryLabel = "Try again",
  action,
  compact = false,
}) {
  return (
    <div
      className={`rounded-xl border border-rose-200 bg-rose-50/60 px-5 text-center ${
        compact ? "py-6" : "py-10"
      }`}
    >
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600">
        <AlertTriangle size={20} aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-rose-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-6 text-rose-700">
        {message}
      </p>
      {(onRetry || action) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw size={13} />
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
