import { NavLink } from "react-router-dom";
import {
  FlaskConical,
  Gauge,
  GitCompare,
  History,
  IndianRupee,
  Settings2,
  Target,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ADMIN_ROLES, ROOFMAX_ROLES, hasRole } from "../../lib/access";

const TABS = [
  {
    to: "/roofmax",
    label: "Potential",
    icon: Gauge,
    end: true,
    roles: ROOFMAX_ROLES,
  },
  {
    to: "/roofmax/configuration",
    label: "Configuration",
    icon: Settings2,
    roles: ADMIN_ROLES,
  },
  {
    to: "/roofmax/recommendation",
    label: "Recommendation",
    icon: Target,
    roles: ROOFMAX_ROLES,
  },
  {
    to: "/roofmax/scenarios",
    label: "Scenarios",
    icon: GitCompare,
    roles: ROOFMAX_ROLES,
  },
  {
    to: "/roofmax/financial",
    label: "Financial",
    icon: IndianRupee,
    roles: ROOFMAX_ROLES,
  },
  {
    to: "/roofmax/scenario-analysis",
    label: "Scenario analysis",
    icon: FlaskConical,
    roles: ROOFMAX_ROLES,
  },
  {
    to: "/roofmax/history",
    label: "History",
    icon: History,
    roles: ROOFMAX_ROLES,
  },
];

export default function RoofMaxTabs() {
  const { user } = useAuth();
  const tabs = TABS.filter((tab) => hasRole(user, tab.roles));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-card scrollbar-thin">
      <nav className="flex min-w-max gap-1" aria-label="RoofMax pages">
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
              {tab.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
