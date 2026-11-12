import {
  Activity,
  Database,
  Gauge,
  GitCompare,
  History,
  PlayCircle,
  Sun,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import { getNavSections as getWorkspaceNavSections, getWorkspacePageMeta } from "./workspaces";

export { getWorkspaceNavSections as getNavSections };

const PAGE_META = {
  "/dashboard": { section: "Overview", title: "National dashboard" },
  "/personal/dashboard": { section: "My home", title: "Personal dashboard" },
  "/my/household": { section: "My home", title: "Household energy" },
  "/my/reports": { section: "My home", title: "My savings & reports" },
  "/discom/dashboard": { section: "DISCOM operations", title: "DISCOM dashboard" },
  "/discom/reports": { section: "Reports & account", title: "Operational reports" },
  "/industry/dashboard": { section: "Industry workspace", title: "Industry dashboard" },
  "/finance/dashboard": { section: "Green finance workspace", title: "Green finance dashboard" },
  "/policy/dashboard": { section: "Policy workspace", title: "Policy dashboard" },
  "/energy": { section: "National intelligence", title: "Renewable energy dashboard" },
  "/rpo": { section: "National intelligence", title: "RPO compliance tracker" },
  "/impact": { section: "National intelligence", title: "Environmental impact" },
  "/forecast": { section: "National intelligence", title: "Forecasting & storage planner" },
  "/solar-calculator": { section: "Opportunities", title: "Rooftop solar calculator" },
  "/jobs": { section: "Opportunities", title: "Green jobs portal" },
  "/finance": { section: "Opportunities", title: "Green finance aggregator" },
  "/circular": { section: "Opportunities", title: "Circular economy tracker" },
  "/community": { section: "Community solar", title: "Community solar hub" },
  "/admin": { section: "Administration", title: "Admin portal" },
  "/settings": { section: "Account", title: "Account settings" },
  "/apartments": { section: "Administration", title: "Apartments" },
  "/simulation": { section: "Community solar", title: "SolarTwin energy overview" },
  "/simulation/solar": { section: "Community solar", title: "Solar generation" },
  "/simulation/apartments": { section: "Community solar", title: "Apartment consumption" },
  "/simulation/common": { section: "Community solar", title: "Common areas" },
  "/simulation/energy-flow": { section: "Community solar", title: "Energy flow" },
  "/simulation/control": { section: "Community solar", title: "Simulation control" },
  "/allocation": { section: "Community solar", title: "Allocation overview" },
  "/allocation/methods": { section: "Community solar", title: "Allocation methods" },
  "/allocation/run": { section: "Community solar", title: "Run allocation" },
  "/allocation/compare": { section: "Community solar", title: "Compare methods" },
  "/allocation/fairness": { section: "Community solar", title: "Fairness analytics" },
  "/allocation/apartments": { section: "Community solar", title: "Apartment details" },
  "/allocation/what-if": { section: "Community solar", title: "What-if simulator" },
  "/allocation/history": { section: "Community solar", title: "Allocation history" },
  "/billing": { section: "Community solar", title: "Billing overview" },
  "/billing/generate": { section: "Community solar", title: "Generate bills" },
  "/billing/apartments": { section: "Community solar", title: "Apartment-wise bills" },
  "/billing/bills": { section: "Community solar", title: "Bill details" },
  "/billing/audit": { section: "Community solar", title: "Billing audit" },
  "/billing/history": { section: "Community solar", title: "Billing history" },
  "/billing/portal": { section: "My home", title: "My electricity bill" },
  "/roofmax": { section: "Community solar", title: "Solar potential" },
  "/roofmax/configuration": { section: "Community solar", title: "Configuration" },
  "/roofmax/recommendation": { section: "Community solar", title: "Recommendation" },
  "/roofmax/scenarios": { section: "Community solar", title: "Capacity scenarios" },
  "/roofmax/financial": { section: "Community solar", title: "Financial analysis" },
  "/roofmax/scenario-analysis": { section: "Community solar", title: "Scenario analysis" },
  "/roofmax/history": { section: "Community solar", title: "Analysis history" },
  "/solarvault": { section: "Community solar", title: "Battery overview" },
  "/solarvault/configuration": { section: "Community solar", title: "Battery configuration" },
  "/solarvault/hourly": { section: "Community solar", title: "Hourly dispatch" },
  "/solarvault/energy-flow": { section: "Community solar", title: "Energy flow" },
  "/solarvault/comparison": { section: "Community solar", title: "Before / after" },
  "/solarvault/scenario": { section: "Community solar", title: "Scenario simulator" },
  "/solarvault/history": { section: "Community solar", title: "Simulation history" },
};

export function getPageMeta(pathname, user) {
  const workspaceMeta = user ? getWorkspacePageMeta(pathname, user) : null;
  if (workspaceMeta) return workspaceMeta;
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  if (pathname.startsWith("/billing/bills/")) {
    return { section: "Community solar", title: "Bill details" };
  }
  if (pathname.startsWith("/admin")) {
    return { section: "Administration", title: "Admin portal" };
  }
  return { section: "India Green Grid", title: "Workspace" };
}

export const LEGACY_ICONS = {
  Gauge,
  PlayCircle,
  GitCompare,
  History,
  Activity,
  Workflow,
  UserRound,
  Database,
  Users,
  Sun,
};
