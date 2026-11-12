export function getInitials(name = "") {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

const ROLE_LABELS = {
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

export function formatRole(role) {
  return ROLE_LABELS[role] || role || "Member";
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatLatency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(1)} ms`;
}

const numberFormatter = (digits) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  if (value === null || value === undefined || Number.isNaN(numeric)) {
    return "—";
  }
  return numberFormatter(digits).format(numeric);
}

export function formatEnergy(value, digits = 1) {
  return `${formatNumber(value, digits)} kWh`;
}

export function formatPercent(value, digits = 1) {
  const numeric = Number(value);
  if (value === null || value === undefined || Number.isNaN(numeric)) {
    return "—";
  }
  return `${formatNumber(numeric, digits)}%`;
}

export function formatCapacity(value, digits = 1) {
  return `${formatNumber(value, digits)} kWp`;
}

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value) {
  const numeric = Number(value);
  if (value === null || value === undefined || Number.isNaN(numeric)) {
    return "—";
  }
  return currencyFormatter.format(numeric);
}

export function formatSignedCurrency(value) {
  const numeric = Number(value);
  if (value === null || value === undefined || Number.isNaN(numeric)) {
    return "—";
  }
  const formatted = currencyFormatter.format(Math.abs(numeric));
  if (numeric < 0) return `− ${formatted}`;
  if (numeric > 0) return `+ ${formatted}`;
  return formatted;
}

const utcHourFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const utcDayFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const utcShortDayFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function asUtcDate(value) {
  if (!value) return null;
  const candidate =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00Z`
      : value;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUtcDate(value) {
  const date = asUtcDate(value);
  return date ? utcDayFormatter.format(date) : "—";
}

export function formatUtcShortDate(value) {
  const date = asUtcDate(value);
  return date ? utcShortDayFormatter.format(date) : "—";
}

export function formatUtcHour(value) {
  const date = asUtcDate(value);
  if (!date) return "—";
  return `${utcHourFormatter.format(date)} UTC`;
}

export function formatUtcHourOnly(value) {
  const date = asUtcDate(value);
  if (!date) return "—";
  return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
}
