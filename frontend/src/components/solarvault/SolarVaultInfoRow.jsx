export default function SolarVaultInfoRow({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500">
        {label}
        {hint && <span className="ml-1 text-[10px] text-slate-400">{hint}</span>}
      </span>
      <span className="text-right font-semibold text-slate-800">
        {value ?? "—"}
      </span>
    </div>
  );
}
