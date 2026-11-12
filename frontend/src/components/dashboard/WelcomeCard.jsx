import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Sparkles, X } from "lucide-react";
import TiltCard from "../effects/TiltCard";
import { formatDate, formatRole } from "../../lib/formatters";

function storageKey(userId) {
  return `solarequity360.welcome-dismissed.${userId}`;
}

export default function WelcomeCard({ user, isAdmin }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey(user?.id)) === "true";
    } catch {
      return false;
    }
  });

  if (!user || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey(user.id), "true");
    } catch {
    }
  }

  const steps = isAdmin
    ? [
        { label: "Review workspace health", to: "/admin/dashboard" },
        { label: "Check module readiness", to: "/simulation" },
        { label: "Manage apartments", to: "/apartments" },
      ]
    : [
        { label: "Review your dashboard", to: "/resident/dashboard" },
        { label: "Explore solar modules", to: "/allocation" },
        { label: "Update account settings", to: "/settings" },
      ];

  return (
    <TiltCard
      className="premium-card relative overflow-hidden rounded-xl border border-forest-100 bg-white p-5 shadow-card"
      maxTilt={2}
      lift={2}
    >
      <div
        className="absolute inset-y-0 left-0 w-1 bg-forest-700"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss welcome message"
      >
        <X size={15} />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="icon-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
          {isAdmin ? <Building2 size={19} /> : <Sparkles size={19} />}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-forest-700">
            Welcome
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
            Hello, {user.name}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-600">
            You are signed in as <strong>{formatRole(user.role)}</strong>. Your
            account was created on {formatDate(user.created_at)}. SolarTwin,
            SolarEquity, BillFair, RoofMax and SolarVault are available from the
            sidebar, while MeterGuard remains planned.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {steps.map((step) => (
              <Link
                key={step.to}
                to={step.to}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-forest-200 hover:text-forest-800"
              >
                {step.label}
                <ArrowRight size={11} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </TiltCard>
  );
}
