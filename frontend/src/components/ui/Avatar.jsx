import { getInitials } from "../../lib/formatters";

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-lg",
};

export default function Avatar({
  name = "User",
  role = "RESIDENT",
  size = "md",
  className = "",
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        role === "ADMIN"
          ? "bg-forest-800 text-white"
          : "bg-emerald-100 text-emerald-800"
      } ${SIZES[size] || SIZES.md} ${className}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}
