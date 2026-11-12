import { Link } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  ShieldCheck,
  Sun,
  Wifi,
} from "lucide-react";
import SolarBackdrop from "../effects/SolarBackdrop";

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Role-based access",
    description: "Six stakeholder portals with JWT authentication and backend-enforced authorization.",
  },
  {
    icon: LayoutDashboard,
    title: "Nine decision modules",
    description: "National energy, RPO, rooftop ROI, jobs, finance, circular economy, impact, forecasting and community solar.",
  },
  {
    icon: Wifi,
    title: "Source provenance",
    description: "Every dataset carries a source, freshness window and explicit sample or unavailable status.",
  },
  {
    icon: Activity,
    title: "Auditable actions",
    description: "Privileged writes are validated and recorded in the platform audit trail.",
  },
];

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  brandPanel = null,
  decorated = false,
  centered = false,
}) {
  return (
    <div
      className={`relative grid min-h-screen bg-white lg:grid-cols-2 ${
        decorated ? "login-shell" : ""
      }`}
    >
      {!decorated && <SolarBackdrop className="opacity-80" />}
      <aside
        className={`relative z-10 hidden overflow-hidden lg:flex ${
          brandPanel
            ? "bg-forest-950"
            : "flex-col justify-between bg-forest-900 px-10 py-10 xl:px-14"
        }`}
      >
        {brandPanel || (
          <>
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 15%, rgba(52,211,153,0.55), transparent 45%), radial-gradient(circle at 85% 75%, rgba(16,185,129,0.35), transparent 45%)",
              }}
              aria-hidden="true"
            />

            <Link to="/login" className="relative inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20">
                <Sun size={21} strokeWidth={2.2} />
              </span>
              <span>
                <span className="block text-sm font-semibold tracking-tight text-white">
                  India Green Grid
                </span>
                <span className="block text-[11px] text-emerald-200/90">
                  National renewable decision support
                </span>
              </span>
            </Link>

            <div className="relative max-w-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                National renewable platform
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white">
                One grid view for every stakeholder.
              </h2>
              <p className="mt-3 text-sm leading-6 text-emerald-100/80">
                India Green Grid connects national renewable intelligence, RPO
                compliance, finance, jobs, circular economy and community solar
                into one transparent workspace.
              </p>

              <ul className="mt-8 space-y-4">
                {HIGHLIGHTS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-200 ring-1 ring-white/10">
                        <Icon size={15} />
                      </span>
                      <span>
                        <span className="block text-xs font-semibold text-white">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-emerald-100/70">
                          {item.description}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="relative text-[11px] text-emerald-200/60">
              © {new Date().getFullYear()} India Green Grid. Sample public datasets are
              labelled; no fabricated live feeds are presented.
            </p>
          </>
        )}
      </aside>

      <main
        className={`relative z-10 flex items-center justify-center px-4 py-10 sm:px-8 ${
          decorated ? "login-panel" : ""
        }`}
      >
        {decorated && (
          <div className="login-panel-decor" aria-hidden="true">
            <span className="login-panel-circle login-panel-circle--one" />
            <span className="login-panel-circle login-panel-circle--two" />
            <span className="login-panel-circle login-panel-circle--three" />
            <svg
              className="login-panel-leaf"
              viewBox="0 0 200 200"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M196 4C128 22 74 58 44 108c-12 20-19 42-20 66 32-10 60-27 82-52 26-29 40-68 42-102 0-5 0-8-2-16Z"
                fill="currentColor"
              />
            </svg>
          </div>
        )}

        <div
          className={`w-full max-w-md ${
            decorated ? "login-panel-content" : ""
          }`}
        >
          <div
            className={`mb-8 flex items-center gap-3 lg:hidden ${
              centered ? "justify-center" : ""
            }`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-800 text-white">
              <Sun size={21} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-slate-900">
                India Green Grid
              </span>
              <span className="block text-[11px] text-slate-500">
                National renewable decision support
              </span>
            </span>
          </div>

          <div className={`mb-7 ${centered ? "text-center" : ""}`}>
            <h1
              className={`font-semibold tracking-tight text-slate-900 ${
                decorated ? "text-[26px] leading-tight sm:text-3xl" : "text-2xl"
              }`}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className={`mt-2 text-sm leading-6 text-slate-500 ${
                  centered ? "mx-auto max-w-sm" : ""
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>

          {children}

          {footer && (
            <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}
