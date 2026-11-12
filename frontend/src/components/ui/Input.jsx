import { forwardRef, useId, useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    icon: Icon,
    id,
    className = "",
    containerClassName = "",
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const helpId = `${inputId}-help`;

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          className={`field ${Icon ? "pl-10" : ""} ${
            error ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15" : ""
          } ${className}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? helpId : undefined}
          {...props}
        />
      </div>
      {error ? (
        <p id={helpId} className="field-error inline-flex items-center gap-1.5">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={helpId} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
});

export const PasswordInput = forwardRef(function PasswordInput(
  {
    label,
    error,
    hint,
    icon: Icon,
    id,
    className = "",
    containerClassName = "",
    ...props
  },
  ref
) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;
  const helpId = `${inputId}-help`;

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          className={`field pr-11 ${Icon ? "pl-10" : ""} ${
            error ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15" : ""
          } ${className}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? helpId : undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error ? (
        <p id={helpId} className="field-error inline-flex items-center gap-1.5">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={helpId} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
});
