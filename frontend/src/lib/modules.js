import {
  BatteryCharging,
  Gauge,
  ReceiptText,
  Ruler,
  Scale,
  Sun,
} from "lucide-react";

const sharedAccent = "border-forest-100 bg-forest-50 text-forest-700";

export const MODULES = [
  {
    key: "simulation",
    name: "Energy Simulation",
    navLabel: "Energy Simulation",
    route: "/simulation",
    endpoint: "/simulation/status",
    icon: Sun,
    accent: sharedAccent,
    implemented: true,
    tagline: "Analyse stored SolarTwin readings",
    description:
      "Inspect solar generation, apartment demand, common-area loads and the building energy balance from stored simulation runs.",
    emptyTitle: "No simulation results yet",
    emptyDescription:
      "Generate a SolarTwin run from the administrator control page to populate the energy dashboard.",
    planned: [
      "Hourly generation and consumption analytics",
      "Common-area category breakdown",
      "Energy-balance and surplus visualisation",
    ],
  },
  {
    key: "allocation",
    name: "Solar Allocation",
    navLabel: "Solar Allocation",
    route: "/allocation",
    endpoint: "/allocation/status",
    icon: Scale,
    accent: sharedAccent,
    implemented: true,
    tagline: "Distribute solar fairly",
    description:
      "Preview, save and compare equal-share, consumption-based and ownership-based solar allocations with capped redistribution, fairness analytics and an immutable audit trail.",
    emptyTitle: "No allocation data yet",
    emptyDescription:
      "Generate a SolarTwin run, then preview or save a fair allocation from the run workspace.",
    planned: [
      "Equal, consumption and ownership methods",
      "Jain fairness analytics and method comparison",
      "Immutable saved runs with hourly records",
    ],
  },
  {
    key: "roofmax",
    name: "RoofMax",
    navLabel: "RoofMax",
    route: "/roofmax",
    endpoint: "/roofmax/status",
    icon: Ruler,
    accent: sharedAccent,
    implemented: true,
    tagline: "Optimise rooftop capacity",
    description:
      "Turn stored SolarTwin demand and administrator planning assumptions into a roof-constrained capacity recommendation, standard-option comparison, conservative/standard/optimistic scenarios and a full financial analysis.",
    emptyTitle: "No capacity analysis yet",
    emptyDescription:
      "An administrator can configure roof, panel and financial assumptions, then generate an analysis from a completed SolarTwin run.",
    planned: [
      "Roof-constrained capacity optimisation",
      "Conservative, standard and optimistic scenarios",
      "Installation, savings, payback, ROI and history",
    ],
  },
  {
    key: "billing",
    name: "BillFair",
    navLabel: "BillFair",
    route: "/billing",
    endpoint: "/billing/status",
    icon: ReceiptText,
    accent: sharedAccent,
    implemented: true,
    tagline: "Monthly bills with an independent audit",
    description:
      "Generate transparent monthly electricity statements from saved SolarEquity allocations, with configurable tariffs, internal solar credits, maintenance, estimated savings, versioned bills, branded PDFs and an independent audit engine.",
    emptyTitle: "No bills issued yet",
    emptyDescription:
      "Generate a preview from the BillFair workspace, then issue bills for the saved allocation run to populate the statement register.",
    planned: [
      "Tariff- and credit-aware per-apartment statements",
      "Immutable issued bills with version history",
      "Independent audit and branded PDF statements",
    ],
  },
  {
    key: "meterguard",
    name: "MeterGuard",
    navLabel: "MeterGuard",
    route: "/meterguard",
    endpoint: "/meterguard/status",
    icon: Gauge,
    accent: sharedAccent,
    tagline: "Protect meter integrity",
    description:
      "Monitor meter readings for anomalies and keep shared solar accounting trustworthy.",
    emptyTitle: "No meter checks yet",
    emptyDescription:
      "The MeterGuard API route is registered and protected, but reading ingestion and anomaly detection are not implemented. No readings or alerts are being shown.",
    planned: [
      "Reading ingestion",
      "Anomaly detection",
      "Reconciliation reports",
    ],
  },
  {
    key: "battery",
    name: "SolarVault",
    navLabel: "SolarVault",
    route: "/solarvault",
    endpoint: "/solarvault/status",
    icon: BatteryCharging,
    accent: sharedAccent,
    implemented: true,
    tagline: "Store surplus solar",
    description:
      "Run an hourly battery dispatch over stored SolarTwin generation and demand. Configure capacity, power limits, efficiencies and state-of-charge bounds, then compare grid import, surplus and solar utilization with and without storage.",
    emptyTitle: "No storage simulation yet",
    emptyDescription:
      "An administrator can configure the battery parameters, then run an hourly simulation from a completed SolarTwin run to populate SolarVault.",
    planned: [
      "Hourly charge and discharge dispatch",
      "State-of-charge and round-trip loss accounting",
      "With-versus-without storage comparison and savings",
    ],
  },
];

export function findModuleByKey(key) {
  return MODULES.find((module) => module.key === key);
}

export function findModuleByPath(pathname) {
  return MODULES.find(
    (module) => pathname === module.route || pathname.startsWith(`${module.route}/`)
  );
}
