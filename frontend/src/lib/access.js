export const ROLE_LABELS = {
  ADMIN: "Administrator",
  RESIDENT: "Resident",
  CITIZEN: "Citizen",
  DISCOM: "DISCOM",
  INDUSTRY: "Industry",
  FINANCIAL_INSTITUTION: "Financial institution",
  POLICYMAKER: "Policymaker",
  SOLAR_INSTALLER: "Solar installer",
  RENEWABLE_SUPPLIER: "Renewable supplier",
  RECYCLER: "Recycler",
};

export const STAKEHOLDER_ROLE_OPTIONS = [
  { value: "RESIDENT", label: "Resident (community solar)" },
  { value: "CITIZEN", label: "Citizen" },
  { value: "DISCOM", label: "DISCOM / distribution utility" },
  { value: "INDUSTRY", label: "Industry / commercial consumer" },
  { value: "FINANCIAL_INSTITUTION", label: "Financial institution" },
  { value: "SOLAR_INSTALLER", label: "Solar installation company" },
  { value: "RENEWABLE_SUPPLIER", label: "Renewable energy supplier" },
  { value: "RECYCLER", label: "Recycling / e-waste facility" },
  { value: "POLICYMAKER", label: "Policymaker / regulator" },
];

export const RPO_ROLES = [
  "ADMIN",
  "DISCOM",
  "INDUSTRY",
  "POLICYMAKER",
];

export const PERSONAL_ROLES = ["RESIDENT", "CITIZEN"];
export const NATIONAL_ANALYTICS_ROLES = [
  "ADMIN",
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "POLICYMAKER",
];
export const IMPACT_ROLES = NATIONAL_ANALYTICS_ROLES;
export const FORECAST_ROLES = NATIONAL_ANALYTICS_ROLES;
export const JOBS_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "INDUSTRY",
  "POLICYMAKER",
];
export const FINANCE_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "POLICYMAKER",
];
export const CIRCULAR_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "INDUSTRY",
  "POLICYMAKER",
];
export const SOLAR_CALCULATOR_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
];
export const COMMUNITY_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "DISCOM",
  "POLICYMAKER",
];
export const BILLING_ROLES = ["ADMIN", "RESIDENT", "CITIZEN"];
export const ALLOCATION_ROLES = ["ADMIN", "RESIDENT", "CITIZEN"];
export const SIMULATION_ROLES = ["ADMIN", "DISCOM"];
export const ROOFMAX_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
];
export const SOLARVAULT_ROLES = ROOFMAX_ROLES;
export const ADMIN_ROLES = ["ADMIN"];
export const DISCOM_ROLES = ["DISCOM"];
export const INDUSTRY_ROLES = ["INDUSTRY"];
export const FINANCIAL_INSTITUTION_ROLES = ["FINANCIAL_INSTITUTION"];
export const POLICYMAKER_ROLES = ["POLICYMAKER"];
export const SOLAR_INSTALLER_ROLES = ["SOLAR_INSTALLER"];
export const RENEWABLE_SUPPLIER_ROLES = ["RENEWABLE_SUPPLIER"];
export const RECYCLER_ROLES = ["RECYCLER"];

export const ORGANISATION_ROLES = [
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "SOLAR_INSTALLER",
  "RENEWABLE_SUPPLIER",
  "RECYCLER",
];

export const SOLAR_WORKFLOW_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "INDUSTRY",
  "SOLAR_INSTALLER",
];
export const COMPLIANCE_WORKFLOW_ROLES = [
  "ADMIN",
  "DISCOM",
  "INDUSTRY",
  "POLICYMAKER",
];
export const PROCUREMENT_ROLES = [
  "ADMIN",
  "DISCOM",
  "RENEWABLE_SUPPLIER",
  "POLICYMAKER",
];
export const LOAN_WORKFLOW_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
];
export const RECYCLING_WORKFLOW_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "INDUSTRY",
  "RECYCLER",
];
export const NOTIFICATION_ROLES = [
  "ADMIN",
  "RESIDENT",
  "CITIZEN",
  "DISCOM",
  "INDUSTRY",
  "FINANCIAL_INSTITUTION",
  "POLICYMAKER",
  "SOLAR_INSTALLER",
  "RENEWABLE_SUPPLIER",
  "RECYCLER",
];

export const ECOSYSTEM_WORKSPACE_ROLES = [
  ...SOLAR_INSTALLER_ROLES,
  ...RENEWABLE_SUPPLIER_ROLES,
  ...RECYCLER_ROLES,
];

export function hasRole(user, allowed) {
  if (!allowed || allowed.length === 0) return true;
  return Boolean(user?.role && allowed.includes(user.role));
}

export function isRpoRole(user) {
  return hasRole(user, RPO_ROLES);
}

export function canAccessRpo(user) {
  return isRpoRole(user);
}

export function roleInitials(role) {
  return ROLE_LABELS[role] || role || "Member";
}
