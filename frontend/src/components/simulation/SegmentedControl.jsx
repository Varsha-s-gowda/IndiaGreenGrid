export default function SegmentedControl({
  options,
  value,
  onChange,
  label,
  size = "sm",
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-md px-2.5 font-medium transition ${
              size === "sm" ? "py-1 text-[11px]" : "py-1.5 text-xs"
            } ${
              active
                ? "bg-white text-forest-800 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
