import { NavLink } from "react-router-dom";
import {
  Building2,
  FlaskConical,
  Gauge,
  GitCompare,
  History,
  PlayCircle,
  Scale,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ADMIN_ROLES, ALLOCATION_ROLES, hasRole } from "../../lib/access";

const TABS = [
  {
    to: "/allocation",
    label: "Overview",
    icon: Gauge,
    end: true,
    roles: ALLOCATION_ROLES,
    requiresApartment: true,
  },
  {
    to: "/allocation/methods",
    label: "Methods",
    icon: Scale,
    roles: ADMIN_ROLES,
  },
  {
    to: "/allocation/run",
    label: "Run allocation",
    icon: PlayCircle,
    roles: ADMIN_ROLES,
  },
  {
    to: "/allocation/compare",
    label: "Compare",
    icon: GitCompare,
    roles: ADMIN_ROLES,
  },
  {
    to: "/allocation/fairness",
    label: "Fairness",
    icon: Sparkles,
    roles: ADMIN_ROLES,
  },
  {
    to: "/allocation/apartments",
    label: "Apartments",
    residentLabel: "My flat",
    icon: Building2,
    roles: ALLOCATION_ROLES,
    requiresApartment: true,
  },
  {
    to: "/allocation/what-if",
    label: "What-if",
    icon: FlaskConical,
    roles: ADMIN_ROLES,
  },
  {
    to: "/allocation/history",
    label: "History",
    icon: History,
    roles: ADMIN_ROLES,
  },
];

export default function AllocationTabs() {
  const { user, isAdmin } = useAuth();
  const tabs = TABS.filter(
    (tab) =>
      hasRole(user, tab.roles) &&
      (!tab.requiresApartment || isAdmin || Boolean(user?.apartment_id))
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-card scrollbar-thin">
      <nav className="flex min-w-max gap-1" aria-label="Solar allocation pages">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? "bg-forest-50 text-forest-800"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <Icon size={14} aria-hidden="true" />
              {isAdmin ? tab.label : tab.residentLabel || tab.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
