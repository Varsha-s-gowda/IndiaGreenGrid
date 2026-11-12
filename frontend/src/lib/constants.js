export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export const WASTE_CATEGORIES = [
  "SOLAR_PANEL",
  "EWASTE",
  "EV_BATTERY",
  "LITHIUM_ION",
  "LEAD_ACID",
  "IT_EQUIPMENT",
  "CABLES",
  "GLASS",
  "ALUMINIUM",
];

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "APPRENTICESHIP",
  "REMOTE",
];

export const EXPERIENCE_LEVELS = ["ENTRY", "JUNIOR", "MID", "SENIOR", "LEAD"];

export const CUSTOMER_TYPES = [
  "RESIDENTIAL",
  "COMMERCIAL",
  "INDUSTRIAL",
  "INSTITUTIONAL",
  "AGRICULTURAL",
];

export const FINANCE_SCHEME_TYPES = [
  "LOAN",
  "SUBSIDY",
  "BOND",
  "LEASE",
  "MARKET",
  "GRANT",
  "GUARANTEE",
];

export function titleCaseToken(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
