import { NavLink } from "react-router-dom";
import {
  Building2,
  FileText,
  Gauge,
  History,
  PlayCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ADMIN_ROLES, BILLING_ROLES, hasRole } from "../../lib/access";

const TABS = [
  {
    to: "/billing",
    label: "Overview",
    icon: Gauge,
    end: true,
    roles: BILLING_ROLES,
    requiresApartment: true,
  },
  {
    to: "/billing/generate",
    label: "Generate bills",
    icon: PlayCircle,
    roles: ADMIN_ROLES,
  },
  {
    to: "/billing/apartments",
    label: "Apartments",
    icon: Building2,
    roles: ADMIN_ROLES,
  },
  {
    to: "/billing/bills",
    label: "Bill details",
    icon: FileText,
    roles: BILLING_ROLES,
    requiresApartment: true,
  },
  {
    to: "/billing/audit",
    label: "Billing audit",
    icon: ShieldCheck,
    roles: ADMIN_ROLES,
  },
  {
    to: "/billing/history",
    label: "History",
    icon: History,
    roles: BILLING_ROLES,
    requiresApartment: true,
  },
  {
    to: "/billing/portal",
    label: "Resident portal",
    residentLabel: "My statement",
    icon: UserRound,
    roles: BILLING_ROLES,
    requiresApartment: true,
  },
];

export default function BillingTabs() {
  const { user, isAdmin } = useAuth();
  const tabs = TABS.filter(
    (tab) =>
      hasRole(user, tab.roles) &&
      (!tab.requiresApartment || isAdmin || Boolean(user?.apartment_id))
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-card scrollbar-thin">
      <nav className="flex min-w-max gap-1" aria-label="BillFair pages">
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
