
import {
  canAccessPath,
  getDashboardPath,
  getNavSections,
  getWorkspace,
} from "../src/lib/workspaces.js";

const ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "POLICYMAKER",
];

const user = (role, extra = {}) => ({ role, email: `${role.toLowerCase()}@example.com`, ...extra });

const failures = [];
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (!condition) {
    failures.push(detail ? `${label} -> ${JSON.stringify(detail)}` : label);
  }
}

const dashboards = new Map();

for (const role of ROLES) {
  const path = getDashboardPath(user(role));
  dashboards.set(role, path);

  check(
    `${role} has a dashboard path`,
    typeof path === "string" && path.startsWith("/"),
    path
  );
  check(`${role} can open its own dashboard`, canAccessPath(user(role), path), path);
}

check(
  "resident and citizen share the personal dashboard",
  dashboards.get("RESIDENT") === dashboards.get("CITIZEN")
);
check(
  "each role group has its own dashboard",
  new Set(dashboards.values()).size === 6,
  Object.fromEntries(dashboards)
);

const DENIED = {
  RESIDENT: [
    "/energy",
    "/impact",
    "/forecast",
    "/rpo",
    "/simulation",
    "/admin",
    "/apartments",
    "/discom/dashboard",
    "/industry/dashboard",
    "/finance/dashboard",
    "/policy/dashboard",
  ],
  CITIZEN: [
    "/energy",
    "/impact",
    "/forecast",
    "/rpo",
    "/simulation",
    "/admin",
    "/apartments",
    "/discom/dashboard",
    "/industry/dashboard",
    "/finance/dashboard",
    "/policy/dashboard",
  ],
  DISCOM: [
    "/admin",
    "/billing",
    "/allocation",
    "/jobs",
    "/finance",
    "/circular",
    "/solar-calculator",
    "/dashboard",
    "/personal/dashboard",
  ],
  INDUSTRY: [
    "/admin",
    "/simulation",
    "/billing",
    "/allocation",
    "/community",
    "/roofmax",
    "/solarvault",
    "/apartments",
    "/dashboard",
    "/personal/dashboard",
  ],
  FINANCIAL_INSTITUTION: [
    "/admin",
    "/jobs",
    "/circular",
    "/rpo",
    "/simulation",
    "/community",
    "/billing",
    "/allocation",
    "/dashboard",
    "/personal/dashboard",
  ],
  POLICYMAKER: [
    "/admin",
    "/simulation",
    "/billing",
    "/allocation",
    "/solar-calculator",
    "/roofmax",
    "/solarvault",
    "/dashboard",
    "/personal/dashboard",
  ],
};

const ALLOWED = {
  RESIDENT: [
    "/personal/dashboard",
    "/my/household",
    "/my/reports",
    "/billing/portal",
    "/allocation",
    "/solar-calculator",
    "/community",
    "/jobs",
    "/finance",
    "/circular",
  ],
  CITIZEN: ["/personal/dashboard", "/my/reports", "/solar-calculator", "/community", "/jobs", "/finance", "/circular"],
  DISCOM: [
    "/discom/dashboard",
    "/discom/reports",
    "/energy",
    "/forecast",
    "/rpo",
    "/impact",
    "/community",
    "/simulation",
    "/roofmax",
    "/solarvault",
  ],
  INDUSTRY: [
    "/industry/dashboard",
    "/rpo",
    "/energy",
    "/forecast",
    "/impact",
    "/finance",
    "/jobs",
    "/circular",
    "/solar-calculator",
  ],
  FINANCIAL_INSTITUTION: [
    "/finance/dashboard",
    "/energy",
    "/impact",
    "/forecast",
    "/finance",
    "/solar-calculator",
  ],
  POLICYMAKER: [
    "/policy/dashboard",
    "/energy",
    "/rpo",
    "/impact",
    "/forecast",
    "/community",
    "/jobs",
    "/finance",
    "/circular",
  ],
};

for (const [role, paths] of Object.entries(DENIED)) {
  for (const path of paths) {
    check(`${role} is denied ${path}`, !canAccessPath(user(role), path), path);
  }
}

for (const [role, paths] of Object.entries(ALLOWED)) {
  for (const path of paths) {
    check(`${role} is allowed ${path}`, canAccessPath(user(role), path), path);
  }
}

check(
  "citizen without a flat cannot open the billing portal",
  !canAccessPath(user("CITIZEN"), "/billing/portal")
);
check(
  "citizen without a flat cannot open the household page",
  !canAccessPath(user("CITIZEN"), "/my/household")
);
check(
  "citizen without a flat keeps the savings report",
  canAccessPath(user("CITIZEN"), "/my/reports")
);

for (const role of ROLES) {
  const workspace = getWorkspace(role);
  const allowed = workspace.allowed || [];
  const denied = workspace.denied || [];

  for (const pattern of allowed) {
    check(
      `${role} allowed list has no denied overlap for ${pattern}`,
      !denied.some(
        (deniedPattern) =>
          deniedPattern === pattern || pattern.startsWith(`${deniedPattern}/`)
      )
    );
  }
}

for (const role of ROLES) {
  const sections = getNavSections(user(role));
  const links = sections.flatMap((section) =>
    section.items.map((item) => ({ section: section.label, label: item.label, to: item.to }))
  );

  check(`${role} sidebar is not empty`, links.length > 0);

  for (const link of links) {
    check(
      `${role} sidebar link ${link.to} is accessible`,
      canAccessPath(user(role), link.to),
      link
    );
  }

  if (role !== "ADMIN") {
    const adminLinks = links.filter((link) => link.to.startsWith("/admin"));
    check(`${role} sidebar shows no administrator controls`, adminLinks.length === 0, adminLinks);
  }
}

for (const role of ["DISCOM", "INDUSTRY", "FINANCIAL_INSTITUTION", "POLICYMAKER", "ADMIN"]) {
  const links = getNavSections(user(role))
    .flatMap((section) => section.items)
    .map((item) => item.to);
  check(
    `${role} sidebar shows no personal resident module`,
    !links.some((to) => to.startsWith("/personal") || to.startsWith("/my/")),
    links
  );
}

if (failures.length) {
  console.error(`Route policy check failed (${failures.length} of ${checks} assertions):`);
  for (const failure of failures) console.error(" -", failure);
  process.exit(1);
}

console.log(`Route policy check passed (${checks} assertions across ${ROLES.length} roles).`);
