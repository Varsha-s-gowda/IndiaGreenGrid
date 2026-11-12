import { METHOD_META } from "../../lib/allocation";

export default function MethodBadge({ method, className = "", short = false }) {
  const meta = METHOD_META[method];
  if (!meta) return null;
  const color = meta.color;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${className}`}
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}12`,
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {short ? meta.shortLabel : meta.label}
    </span>
  );
}
