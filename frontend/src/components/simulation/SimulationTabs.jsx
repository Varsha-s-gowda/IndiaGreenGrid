import { NavLink } from "react-router-dom";
import {
  Building2,
  Gauge,
  SlidersHorizontal,
  Sun,
  Warehouse,
  Workflow,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ADMIN_ROLES, SIMULATION_ROLES, hasRole } from "../../lib/access";

const TABS = [
  {
    to: "/simulation",
    label: "Overview",
    icon: Gauge,
    end: true,
    roles: SIMULATION_ROLES,
  },
  {
    to: "/simulation/solar",
    label: "Solar generation",
    icon: Sun,
    roles: SIMULATION_ROLES,
  },
  {
    to: "/simulation/apartments",
    label: "Apartments",
    icon: Building2,
    roles: SIMULATION_ROLES,
  },
  {
    to: "/simulation/common",
    label: "Common areas",
    icon: Warehouse,
    roles: SIMULATION_ROLES,
  },
  {
    to: "/simulation/energy-flow",
    label: "Energy flow",
    icon: Workflow,
    roles: SIMULATION_ROLES,
  },
  {
    to: "/simulation/control",
    label: "Simulation control",
    icon: SlidersHorizontal,
    roles: ADMIN_ROLES,
  },
];

export default function SimulationTabs() {
  const { user } = useAuth();
  const tabs = TABS.filter((tab) => hasRole(user, tab.roles));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-card scrollbar-thin">
      <nav className="flex min-w-max gap-1" aria-label="SolarTwin pages">
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
