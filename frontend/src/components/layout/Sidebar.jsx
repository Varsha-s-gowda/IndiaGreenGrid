import { NavLink } from "react-router-dom";
import { ArrowUpRight, Sun, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useHealth } from "../../context/HealthContext";
import { SWAGGER_URL } from "../../lib/config";
import { getNavSections } from "../../lib/navigation";
import Logo from "../ui/Logo";
import { RoleBadge } from "../ui/Badge";

const STATUS_STYLES = {
  online: "bg-emerald-50 text-emerald-700 border-emerald-100",
  degraded: "bg-amber-50 text-amber-700 border-amber-100",
  offline: "bg-rose-50 text-rose-700 border-rose-100",
  checking: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABEL = {
  online: "All systems online",
  degraded: "Database degraded",
  offline: "Backend offline",
  checking: "Checking status…",
};

function navItemClass({ isActive }) {
  return [
    "sidebar-link group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
    isActive
      ? "is-active bg-forest-50 font-semibold text-forest-800"
      : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

export default function Sidebar({ mobileOpen = false, onClose }) {
  const { user, isAdmin, dashboardPath } = useAuth();
  const { status } = useHealth();
  const sections = getNavSections(user);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <NavLink to={dashboardPath} onClick={onClose}>
          <Logo />
        </NavLink>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 lg:hidden"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="Primary">
        {sections.map((section) => {
          const items = section.items;
          if (!items.length) return null;
          return (
            <div key={section.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={navItemClass}
                        onClick={onClose}
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition ${
                                isActive ? "bg-forest-700" : "bg-transparent"
                              }`}
                              aria-hidden="true"
                            />
                            <Icon
                              size={17}
                              className={
                                isActive
                                  ? "text-forest-700"
                                  : "text-slate-400 group-hover:text-slate-600"
                              }
                            />
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-4 py-4">
        <div
          className={`mb-3 flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
            STATUS_STYLES[status] || STATUS_STYLES.checking
          }`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {status !== "offline" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
          <span className="truncate text-[11px] font-medium">
            {STATUS_LABEL[status] || STATUS_LABEL.checking}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800">
              {user?.name || "Signed in"}
            </p>
            <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
          </div>
          <RoleBadge role={user?.role} />
        </div>

        {isAdmin && (
          <a
            href={SWAGGER_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition hover:text-forest-700"
          >
            <Sun size={12} />
            API reference
            <ArrowUpRight size={12} />
          </a>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] border-r border-slate-200 bg-white shadow-dropdown">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
