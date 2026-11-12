import {
  Building2,
  Factory,
  Home,
  Landmark,
  Leaf,
  ShieldCheck,
  Users,
} from "lucide-react";

const VARIANTS = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  forest: "border-forest-100 bg-forest-50 text-forest-700",
};

export default function Badge({
  variant = "neutral",
  dot = false,
  className = "",
  children,
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        VARIANTS[variant] || VARIANTS.neutral
      } ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

const ROLE_CONFIG = {
  ADMIN: { label: "Administrator", variant: "forest", icon: ShieldCheck },
  RESIDENT: { label: "Resident", variant: "success", icon: Home },
  CITIZEN: { label: "Citizen", variant: "info", icon: Users },
  DISCOM: { label: "DISCOM", variant: "warning", icon: Building2 },
  INDUSTRY: { label: "Industry", variant: "neutral", icon: Factory },
  FINANCIAL_INSTITUTION: {
    label: "Financial institution",
    variant: "neutral",
    icon: Landmark,
  },
  POLICYMAKER: { label: "Policymaker", variant: "forest", icon: Leaf },
};

export function RoleBadge({ role }) {
  const config = ROLE_CONFIG[role] || {
    label: role || "Member",
    variant: "neutral",
    icon: Users,
  };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon size={11} />
      {config.label}
    </Badge>
  );
}
