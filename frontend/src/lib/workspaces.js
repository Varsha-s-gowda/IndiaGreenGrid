import {
  BatteryCharging,
  Bell,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ClipboardList,
  CloudSun,
  FileCheck2,
  FileText,
  Gauge,
  HandCoins,
  Handshake,
  Inbox,
  Landmark,
  LayoutDashboard,
  Leaf,
  Package,
  ReceiptText,
  Recycle,
  Ruler,
  Scale,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  Truck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";


const PERSONAL_NAV = [
  {
    label: "My home",
    items: [
      {
        key: "personal-dashboard",
        label: "My dashboard",
        title: "Personal dashboard",
        to: "/personal/dashboard",
        icon: LayoutDashboard,
        end: true,
      },
      {
        key: "household",
        label: "Household energy",
        title: "Household energy",
        to: "/my/household",
        icon: Zap,
        requiresApartment: true,
      },
      {
        key: "allocation",
        label: "Solar allocation",
        title: "My solar allocation",
        to: "/allocation",
        icon: Scale,
        requiresApartment: true,
        end: true,
      },
      {
        key: "billing",
        label: "Monthly bill",
        title: "My electricity bill",
        to: "/billing/portal",
        icon: ReceiptText,
        requiresApartment: true,
      },
      {
        key: "reports",
        label: "Savings & reports",
        title: "My savings & reports",
        to: "/my/reports",
        icon: FileText,
      },
      {
        key: "rooftop",
        label: "Rooftop calculator",
        title: "Rooftop solar calculator",
        to: "/solar-calculator",
        icon: Calculator,
      },
    ],
  },
  {
    label: "Solar services",
    items: [
      {
        key: "solar-requests",
        label: "My solar requests",
        title: "Solar installation requests",
        to: "/solar-requests",
        icon: Wrench,
      },
      {
        key: "solar-installations",
        label: "My installations",
        title: "Solar installations",
        to: "/solar-installations",
        icon: Sun,
      },
      {
        key: "loans",
        label: "Green loans",
        title: "Green loan marketplace",
        to: "/loans",
        icon: HandCoins,
      },
      {
        key: "recycling-requests",
        label: "Recycling pickups",
        title: "Recycling pickups",
        to: "/recycling-requests",
        icon: Truck,
      },
      {
        key: "notifications",
        label: "Notifications",
        title: "Notifications",
        to: "/notifications",
        icon: Bell,
      },
    ],
  },
  {
    label: "Community solar",
    items: [
      {
        key: "community",
        label: "Community hub",
        title: "Community solar hub",
        to: "/community",
        icon: Building2,
      },
    ],
  },
  {
    label: "Opportunities",
    items: [
      {
        key: "jobs",
        label: "Green jobs",
        title: "Green jobs portal",
        to: "/jobs",
        icon: BriefcaseBusiness,
      },
      {
        key: "finance",
        label: "Green finance",
        title: "Green finance aggregator",
        to: "/finance",
        icon: Landmark,
      },
      {
        key: "circular",
        label: "Circular economy",
        title: "Circular economy tracker",
        to: "/circular",
        icon: Recycle,
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        key: "settings",
        label: "Settings",
        title: "Account settings",
        to: "/settings",
        icon: Settings,
      },
    ],
  },
];

const WORKSPACES = {
  ADMIN: {
    key: "admin",
    label: "National administrator",
    dashboardPath: "/dashboard",
    dashboardLabel: "National dashboard",
    unrestricted: true,
    sections: [
      {
        label: "Overview",
        items: [
          {
            key: "dashboard",
            label: "National dashboard",
            title: "National dashboard",
            to: "/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
        ],
      },
      {
        label: "National intelligence",
        items: [
          {
            key: "energy",
            label: "Energy analytics",
            title: "Renewable energy dashboard",
            to: "/energy",
            icon: Zap,
          },
          {
            key: "rpo",
            label: "RPO tracking",
            title: "RPO compliance tracker",
            to: "/rpo",
            icon: Target,
          },
          {
            key: "impact",
            label: "Environmental impact",
            title: "Environmental impact",
            to: "/impact",
            icon: Leaf,
          },
          {
            key: "forecast",
            label: "Forecast & storage",
            title: "Forecasting & storage planner",
            to: "/forecast",
            icon: CloudSun,
          },
        ],
      },
      {
        label: "Opportunities",
        items: [
          {
            key: "jobs",
            label: "Renewable energy jobs",
            title: "Green jobs portal",
            to: "/jobs",
            icon: BriefcaseBusiness,
          },
          {
            key: "finance",
            label: "Green finance",
            title: "Green finance aggregator",
            to: "/finance",
            icon: Landmark,
          },
          {
            key: "circular",
            label: "Circular economy",
            title: "Circular economy tracker",
            to: "/circular",
            icon: Recycle,
          },
          {
            key: "solar-calculator",
            label: "Rooftop calculator",
            title: "Rooftop solar calculator",
            to: "/solar-calculator",
            icon: Calculator,
          },
        ],
      },
      {
        label: "Ecosystem operations",
        items: [
          {
            key: "admin-ecosystem",
            label: "Ecosystem control",
            title: "Ecosystem control",
            to: "/admin/ecosystem",
            icon: ShieldCheck,
          },
          {
            key: "solar-requests",
            label: "Solar requests",
            title: "Solar installation requests",
            to: "/solar-requests",
            icon: Wrench,
          },
          {
            key: "compliance",
            label: "Compliance filings",
            title: "RPO compliance filings",
            to: "/compliance",
            icon: FileCheck2,
          },
          {
            key: "procurement",
            label: "Procurement",
            title: "Procurement marketplace",
            to: "/procurement",
            icon: Handshake,
          },
          {
            key: "loans",
            label: "Loan marketplace",
            title: "Green loan marketplace",
            to: "/loans",
            icon: HandCoins,
          },
          {
            key: "loan-applications",
            label: "Loan applications",
            title: "Loan applications",
            to: "/loan-applications",
            icon: ClipboardList,
          },
          {
            key: "recycling-requests",
            label: "Recycling requests",
            title: "Recycling pickups",
            to: "/recycling-requests",
            icon: Truck,
          },
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
        ],
      },
      {
        label: "Community solar management",
        items: [
          {
            key: "community",
            label: "Community hub",
            title: "Community solar hub",
            to: "/community",
            icon: Building2,
          },
          {
            key: "simulation",
            label: "SolarTwin",
            title: "SolarTwin energy overview",
            to: "/simulation",
            icon: Sun,
          },
          {
            key: "allocation",
            label: "Fair allocation",
            title: "Allocation overview",
            to: "/allocation",
            icon: Scale,
          },
          {
            key: "billing",
            label: "BillFair",
            title: "Billing overview",
            to: "/billing",
            icon: ReceiptText,
          },
          {
            key: "roofmax",
            label: "RoofMax",
            title: "Solar potential",
            to: "/roofmax",
            icon: Ruler,
          },
          {
            key: "solarvault",
            label: "SolarVault",
            title: "Battery overview",
            to: "/solarvault",
            icon: BatteryCharging,
          },
        ],
      },
      {
        label: "Administration",
        items: [
          {
            key: "admin",
            label: "User & system controls",
            title: "Admin portal",
            to: "/admin",
            icon: ShieldCheck,
          },
          {
            key: "apartments",
            label: "Apartment register",
            title: "Apartments",
            to: "/apartments",
            icon: Users,
          },
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
  },

  RESIDENT: {
    key: "resident",
    label: "Resident workspace",
    dashboardPath: "/personal/dashboard",
    dashboardLabel: "My dashboard",
    sections: PERSONAL_NAV,
    allowed: [
      "/personal",
      "/my",
      "/billing",
      "/allocation",
      "/solar-calculator",
      "/solar-requests",
      "/solar-installations",
      "/loans",
      "/loan-applications",
      "/recycling-requests",
      "/notifications",
      "/community",
      "/jobs",
      "/finance",
      "/circular",
      "/settings",
      "/modules",
    ],
    denied: [
      "/billing/generate",
      "/billing/audit",
      "/allocation/methods",
      "/allocation/run",
      "/allocation/compare",
      "/allocation/fairness",
      "/allocation/what-if",
      "/allocation/history",
    ],
  },

  CITIZEN: {
    key: "citizen",
    label: "Citizen workspace",
    dashboardPath: "/personal/dashboard",
    dashboardLabel: "My dashboard",
    sections: PERSONAL_NAV,
    allowed: [
      "/personal",
      "/my/reports",
      "/billing",
      "/allocation",
      "/solar-calculator",
      "/solar-requests",
      "/solar-installations",
      "/loans",
      "/loan-applications",
      "/recycling-requests",
      "/notifications",
      "/community",
      "/jobs",
      "/finance",
      "/circular",
      "/settings",
      "/modules",
    ],
    denied: [
      "/billing/generate",
      "/billing/audit",
      "/allocation/methods",
      "/allocation/run",
      "/allocation/compare",
      "/allocation/fairness",
      "/allocation/what-if",
      "/allocation/history",
    ],
  },

  DISCOM: {
    key: "discom",
    label: "DISCOM operations",
    dashboardPath: "/discom/dashboard",
    dashboardLabel: "DISCOM dashboard",
    sections: [
      {
        label: "DISCOM operations",
        items: [
          {
            key: "discom-dashboard",
            label: "DISCOM dashboard",
            title: "DISCOM dashboard",
            to: "/discom/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
          {
            key: "energy",
            label: "Demand & supply",
            title: "Demand and supply analytics",
            to: "/energy",
            icon: Zap,
          },
          {
            key: "forecast",
            label: "Renewable integration",
            title: "Forecasting & storage planner",
            to: "/forecast",
            icon: CloudSun,
          },
          {
            key: "rpo",
            label: "RPO compliance",
            title: "RPO compliance tracker",
            to: "/rpo",
            icon: Target,
          },
          {
            key: "compliance",
            label: "Monthly filings",
            title: "RPO compliance filings",
            to: "/compliance",
            icon: FileCheck2,
          },
          {
            key: "procurement",
            label: "Power procurement",
            title: "Procurement marketplace",
            to: "/procurement",
            icon: Handshake,
          },
          {
            key: "impact",
            label: "Environmental impact",
            title: "Environmental impact",
            to: "/impact",
            icon: Leaf,
          },
        ],
      },
      {
        label: "Grid & community",
        items: [
          {
            key: "community",
            label: "Distribution & community solar",
            title: "Community solar monitoring",
            to: "/community",
            icon: Building2,
          },
          {
            key: "simulation",
            label: "SolarTwin simulation",
            title: "SolarTwin energy overview",
            to: "/simulation",
            icon: Sun,
          },
          {
            key: "roofmax",
            label: "Rooftop optimisation",
            title: "Solar potential",
            to: "/roofmax",
            icon: Ruler,
          },
          {
            key: "solarvault",
            label: "Battery dispatch",
            title: "Battery overview",
            to: "/solarvault",
            icon: BatteryCharging,
          },
        ],
      },
      {
        label: "Reports & account",
        items: [
          {
            key: "discom-reports",
            label: "Operational reports",
            title: "Operational reports",
            to: "/discom/reports",
            icon: Gauge,
          },
          {
            key: "organisation",
            label: "Organisation profile",
            title: "Organisation profile",
            to: "/organisation",
            icon: Building2,
          },
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
    allowed: [
      "/discom",
      "/energy",
      "/forecast",
      "/rpo",
      "/compliance",
      "/procurement",
      "/impact",
      "/community",
      "/simulation",
      "/roofmax",
      "/solarvault",
      "/organisation",
      "/notifications",
      "/settings",
      "/modules",
    ],
  },

  INDUSTRY: {
    key: "industry",
    label: "Industrial consumer workspace",
    dashboardPath: "/industry/dashboard",
    dashboardLabel: "Industry dashboard",
    sections: [
      {
        label: "Industry workspace",
        items: [
          {
            key: "industry-dashboard",
            label: "Industry dashboard",
            title: "Industry dashboard",
            to: "/industry/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
          {
            key: "rpo",
            label: "RPO compliance",
            title: "RPO compliance tracker",
            to: "/rpo",
            icon: Target,
          },
          {
            key: "energy",
            label: "Energy outlook",
            title: "Renewable energy dashboard",
            to: "/energy",
            icon: Zap,
          },
          {
            key: "forecast",
            label: "Forecast & storage",
            title: "Forecasting & storage planner",
            to: "/forecast",
            icon: CloudSun,
          },
          {
            key: "impact",
            label: "Environmental impact",
            title: "Environmental impact",
            to: "/impact",
            icon: Leaf,
          },
        ],
      },
      {
        label: "Opportunities & finance",
        items: [
          {
            key: "finance",
            label: "Green finance",
            title: "Green finance aggregator",
            to: "/finance",
            icon: Landmark,
          },
          {
            key: "jobs",
            label: "Green jobs",
            title: "Green jobs portal",
            to: "/jobs",
            icon: BriefcaseBusiness,
          },
          {
            key: "circular",
            label: "Circular economy",
            title: "Circular economy tracker",
            to: "/circular",
            icon: Recycle,
          },
          {
            key: "solar-calculator",
            label: "Rooftop calculator",
            title: "Rooftop solar calculator",
            to: "/solar-calculator",
            icon: Calculator,
          },
          {
            key: "solar-requests",
            label: "Solar installation",
            title: "Solar installation requests",
            to: "/solar-requests",
            icon: Wrench,
          },
          {
            key: "solar-installations",
            label: "Installations",
            title: "Solar installations",
            to: "/solar-installations",
            icon: Sun,
          },
          {
            key: "loans",
            label: "Green loans",
            title: "Green loan marketplace",
            to: "/loans",
            icon: HandCoins,
          },
          {
            key: "recycling-requests",
            label: "Recycling pickups",
            title: "Recycling pickups",
            to: "/recycling-requests",
            icon: Truck,
          },
        ],
      },
      {
        label: "Compliance",
        items: [
          {
            key: "compliance",
            label: "RPO filings",
            title: "RPO compliance filings",
            to: "/compliance",
            icon: FileCheck2,
          },
          {
            key: "organisation",
            label: "Organisation profile",
            title: "Organisation profile",
            to: "/organisation",
            icon: Building2,
          },
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
        ],
      },
      {
        label: "Account",
        items: [
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
    allowed: [
      "/industry",
      "/rpo",
      "/energy",
      "/forecast",
      "/impact",
      "/finance",
      "/jobs",
      "/circular",
      "/solar-calculator",
      "/solar-requests",
      "/solar-installations",
      "/loans",
      "/loan-applications",
      "/recycling-requests",
      "/compliance",
      "/organisation",
      "/notifications",
      "/settings",
      "/modules",
    ],
  },

  FINANCIAL_INSTITUTION: {
    key: "finance",
    label: "Green finance partner workspace",
    dashboardPath: "/finance/dashboard",
    dashboardLabel: "Finance dashboard",
    sections: [
      {
        label: "Green finance workspace",
        items: [
          {
            key: "finance-dashboard",
            label: "Finance dashboard",
            title: "Green finance dashboard",
            to: "/finance/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
          {
            key: "energy",
            label: "Energy market",
            title: "Renewable energy dashboard",
            to: "/energy",
            icon: Zap,
          },
          {
            key: "impact",
            label: "Environmental impact",
            title: "Environmental impact",
            to: "/impact",
            icon: Leaf,
          },
          {
            key: "forecast",
            label: "Forecast & storage",
            title: "Forecasting & storage planner",
            to: "/forecast",
            icon: CloudSun,
          },
        ],
      },
      {
        label: "Deal pipeline",
        items: [
          {
            key: "finance",
            label: "Finance catalogue",
            title: "Green finance aggregator",
            to: "/finance",
            icon: Landmark,
          },
          {
            key: "solar-calculator",
            label: "Rooftop assessments",
            title: "Rooftop solar calculator",
            to: "/solar-calculator",
            icon: Calculator,
          },
          {
            key: "loans",
            label: "Loan products",
            title: "Green loan products",
            to: "/loans",
            icon: HandCoins,
          },
          {
            key: "loan-applications",
            label: "Loan applications",
            title: "Loan applications",
            to: "/loan-applications",
            icon: ClipboardList,
          },
        ],
      },
      {
        label: "Account",
        items: [
          {
            key: "organisation",
            label: "Organisation profile",
            title: "Organisation profile",
            to: "/organisation",
            icon: Building2,
          },
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
    allowed: [
      "/finance",
      "/energy",
      "/impact",
      "/forecast",
      "/solar-calculator",
      "/loans",
      "/loan-applications",
      "/organisation",
      "/notifications",
      "/settings",
      "/modules",
    ],
  },

  POLICYMAKER: {
    key: "policy",
    label: "Policy & regulation workspace",
    dashboardPath: "/policy/dashboard",
    dashboardLabel: "Policy dashboard",
    sections: [
      {
        label: "Policy workspace",
        items: [
          {
            key: "policy-dashboard",
            label: "Policy dashboard",
            title: "Policy dashboard",
            to: "/policy/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
          {
            key: "energy",
            label: "Energy analytics",
            title: "Renewable energy dashboard",
            to: "/energy",
            icon: Zap,
          },
          {
            key: "rpo",
            label: "RPO tracking",
            title: "RPO compliance tracker",
            to: "/rpo",
            icon: Target,
          },
          {
            key: "impact",
            label: "Environmental impact",
            title: "Environmental impact",
            to: "/impact",
            icon: Leaf,
          },
          {
            key: "forecast",
            label: "Forecast & storage",
            title: "Forecasting & storage planner",
            to: "/forecast",
            icon: CloudSun,
          },
        ],
      },
      {
        label: "Oversight",
        items: [
          {
            key: "community",
            label: "Community solar",
            title: "Community solar hub",
            to: "/community",
            icon: Building2,
          },
          {
            key: "jobs",
            label: "Green jobs",
            title: "Green jobs portal",
            to: "/jobs",
            icon: BriefcaseBusiness,
          },
          {
            key: "finance",
            label: "Green finance",
            title: "Green finance aggregator",
            to: "/finance",
            icon: Landmark,
          },
          {
            key: "circular",
            label: "Circular economy",
            title: "Circular economy tracker",
            to: "/circular",
            icon: Recycle,
          },
          {
            key: "compliance",
            label: "Verified RPO filings",
            title: "RPO compliance filings",
            to: "/compliance",
            icon: FileCheck2,
          },
          {
            key: "procurement",
            label: "Procurement oversight",
            title: "Procurement marketplace",
            to: "/procurement",
            icon: Handshake,
          },
        ],
      },
      {
        label: "Account",
        items: [
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
    allowed: [
      "/policy",
      "/energy",
      "/rpo",
      "/impact",
      "/forecast",
      "/community",
      "/jobs",
      "/finance",
      "/circular",
      "/compliance",
      "/procurement",
      "/notifications",
      "/settings",
      "/modules",
    ],
  },

  SOLAR_INSTALLER: {
    key: "installer",
    label: "Solar installer workspace",
    dashboardPath: "/installer/dashboard",
    dashboardLabel: "Installer dashboard",
    sections: [
      {
        label: "Installer workspace",
        items: [
          {
            key: "installer-dashboard",
            label: "Installer dashboard",
            title: "Installer dashboard",
            to: "/installer/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
          {
            key: "solar-requests",
            label: "Request inbox",
            title: "Solar installation requests",
            to: "/solar-requests",
            icon: Inbox,
          },
          {
            key: "installations",
            label: "Installations",
            title: "Installations",
            to: "/solar-installations",
            icon: Wrench,
          },
        ],
      },
      {
        label: "Business",
        items: [
          {
            key: "organisation",
            label: "Organisation profile",
            title: "Organisation profile",
            to: "/organisation",
            icon: Building2,
          },
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
    allowed: [
      "/installer",
      "/solar-requests",
      "/solar-installations",
      "/organisation",
      "/notifications",
      "/settings",
      "/modules",
    ],
  },

  RENEWABLE_SUPPLIER: {
    key: "supplier",
    label: "Renewable supplier workspace",
    dashboardPath: "/supplier/dashboard",
    dashboardLabel: "Supplier dashboard",
    sections: [
      {
        label: "Supplier workspace",
        items: [
          {
            key: "supplier-dashboard",
            label: "Supplier dashboard",
            title: "Supplier dashboard",
            to: "/supplier/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
          {
            key: "procurement",
            label: "Procurement marketplace",
            title: "Procurement marketplace",
            to: "/procurement",
            icon: Handshake,
          },
          {
            key: "quotations",
            label: "My quotations",
            title: "My quotations",
            to: "/procurement/quotations",
            icon: Package,
          },
        ],
      },
      {
        label: "Business",
        items: [
          {
            key: "organisation",
            label: "Organisation profile",
            title: "Organisation profile",
            to: "/organisation",
            icon: Building2,
          },
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
    allowed: [
      "/supplier",
      "/procurement",
      "/organisation",
      "/notifications",
      "/settings",
      "/modules",
    ],
  },

  RECYCLER: {
    key: "recycler",
    label: "Recycling facility workspace",
    dashboardPath: "/recycler/dashboard",
    dashboardLabel: "Recycler dashboard",
    sections: [
      {
        label: "Recycling workspace",
        items: [
          {
            key: "recycler-dashboard",
            label: "Recycler dashboard",
            title: "Recycler dashboard",
            to: "/recycler/dashboard",
            icon: LayoutDashboard,
            end: true,
          },
          {
            key: "recycling-requests",
            label: "Pickup requests",
            title: "Recycling pickups",
            to: "/recycling-requests",
            icon: Truck,
          },
        ],
      },
      {
        label: "Business",
        items: [
          {
            key: "organisation",
            label: "Organisation profile",
            title: "Organisation profile",
            to: "/organisation",
            icon: Building2,
          },
          {
            key: "notifications",
            label: "Notifications",
            title: "Notifications",
            to: "/notifications",
            icon: Bell,
          },
          {
            key: "settings",
            label: "Settings",
            title: "Account settings",
            to: "/settings",
            icon: Settings,
          },
        ],
      },
    ],
    allowed: [
      "/recycler",
      "/recycling-requests",
      "/organisation",
      "/notifications",
      "/settings",
      "/modules",
    ],
  },
};

export const DEFAULT_WORKSPACE = {
  key: "guest",
  label: "India Green Grid",
  dashboardPath: "/login",
  dashboardLabel: "Workspace",
  sections: [],
  allowed: [],
  denied: [],
};

const ROLE_DASHBOARD_PATHS = Object.values(WORKSPACES).map(
  (workspace) => workspace.dashboardPath
);

export function getWorkspace(role) {
  return WORKSPACES[role] || DEFAULT_WORKSPACE;
}

export function getDashboardPath(user) {
  return getWorkspace(user?.role).dashboardPath;
}

function matches(pathname, pattern) {
  if (pattern === "/") return true;
  return pathname === pattern || pathname.startsWith(`${pattern}/`);
}

function citizenWithoutFlat(user) {
  return user?.role === "CITIZEN" && !user?.apartment_id;
}

export function canAccessPath(user, pathname) {
  if (!user?.role) return false;
  const workspace = getWorkspace(user.role);
  if (workspace.unrestricted) return true;

  const path = pathname || "/";
  const denied = [...(workspace.denied || [])];

  for (const dashboardPath of ROLE_DASHBOARD_PATHS) {
    if (dashboardPath !== workspace.dashboardPath) denied.push(dashboardPath);
  }

  if (citizenWithoutFlat(user)) {
    denied.push("/billing", "/allocation", "/my/household");
  }
  if (denied.some((pattern) => matches(path, pattern))) return false;
  return (workspace.allowed || []).some((pattern) => matches(path, pattern));
}

export function getNavSections(user) {
  const workspace = getWorkspace(user?.role);
  return workspace.sections
    .map((section) => ({
      label: section.label,
      items: section.items.filter(
        (item) => !item.requiresApartment || Boolean(user?.apartment_id)
      ),
    }))
    .filter((section) => section.items.length);
}

export function getWorkspacePageMeta(pathname, user) {
  const sections = getNavSections(user);
  for (const section of sections) {
    for (const item of section.items) {
      if (matches(pathname || "/", item.to)) {
        return {
          section: section.label,
          title: item.title || item.label,
        };
      }
    }
  }
  return null;
}
