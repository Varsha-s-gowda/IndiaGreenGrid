import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useHealth } from "../../context/HealthContext";
import { formatRole } from "../../lib/formatters";
import { getPageMeta } from "../../lib/navigation";
import Avatar from "../ui/Avatar";
import { RoleBadge } from "../ui/Badge";
import NotificationBell from "../notifications/NotificationBell";

const STATUS_CONFIG = {
  online: { label: "Operational", className: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  degraded: { label: "Degraded", className: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  offline: { label: "Offline", className: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  checking: { label: "Checking", className: "border-slate-200 bg-slate-50 text-slate-600", dot: "bg-slate-400" },
};

function ConnectionPill() {
  const { status } = useHealth();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.checking;

  return (
    <span
      className={`hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium md:inline-flex ${config.className}`}
      title="Live status from /api/health and /api/health/database"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label}
    </span>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleLogout() {
    setOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-lg border border-transparent p-1 pr-2 transition hover:border-slate-200 hover:bg-white"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        <Avatar name={user?.name} role={user?.role} size="sm" />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-xs font-semibold text-slate-800">
            {user?.name}
          </span>
          <span className="block truncate text-[10px] text-slate-500">
            {formatRole(user?.role)}
          </span>
        </span>
        <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-dropdown">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <Avatar name={user?.name} role={user?.role} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user?.name}
              </p>
              <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
            </div>
          </div>

          <div className="px-4 py-2.5">
            <RoleBadge role={user?.role} />
          </div>

          <div className="border-t border-slate-100 p-1.5">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Settings size={15} className="text-slate-400" />
              Account settings
            </Link>
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-500">
              {user?.role === "ADMIN" ? (
                <ShieldCheck size={15} className="text-slate-400" />
              ) : (
                <UserRound size={15} className="text-slate-400" />
              )}
              {formatRole(user?.role)} workspace
            </div>
          </div>

          <div className="border-t border-slate-100 p-1.5">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onOpenMenu }) {
  const location = useLocation();
  const { user } = useAuth();
  const meta = getPageMeta(location.pathname, user);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="page-container flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-700 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {meta.section}
          </p>
          <h1 className="truncate text-sm font-semibold text-slate-900">
            {meta.title}
          </h1>
        </div>

        <ConnectionPill />
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
