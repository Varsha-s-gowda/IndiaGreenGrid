import { NavLink } from "react-router-dom";
import {
  Activity,
  BatteryCharging,
  FlaskConical,
  GitCompare,
  History,
  Settings2,
  Workflow,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ADMIN_ROLES, SOLARVAULT_ROLES, hasRole } from "../../lib/access";

const TABS = [
  {
    to: "/solarvault",
    label: "Battery overview",
    icon: BatteryCharging,
    end: true,
    roles: SOLARVAULT_ROLES,
  },
  {
    to: "/solarvault/configuration",
    label: "Configuration",
    icon: Settings2,
    roles: ADMIN_ROLES,
  },
  {
    to: "/solarvault/hourly",
    label: "Hourly dispatch",
    icon: Activity,
    roles: SOLARVAULT_ROLES,
  },
  {
    to: "/solarvault/energy-flow",
    label: "Energy flow",
    icon: Workflow,
    roles: SOLARVAULT_ROLES,
  },
  {
    to: "/solarvault/comparison",
    label: "Before / after",
    icon: GitCompare,
    roles: SOLARVAULT_ROLES,
  },
  {
    to: "/solarvault/scenario",
    label: "Scenario simulator",
    icon: FlaskConical,
    roles: ADMIN_ROLES,
  },
  {
    to: "/solarvault/history",
    label: "History",
    icon: History,
    roles: SOLARVAULT_ROLES,
  },
];

export default function SolarVaultTabs() {
  const { user } = useAuth();
  const tabs = TABS.filter((tab) => hasRole(user, tab.roles));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-card scrollbar-thin">
      <nav className="flex min-w-max gap-1" aria-label="SolarVault pages">
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
