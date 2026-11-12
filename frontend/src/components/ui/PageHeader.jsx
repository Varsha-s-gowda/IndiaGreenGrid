import { motion } from "framer-motion";
import { useReducedMotionPreference } from "../effects/usePointerCapability";

const EASE_OUT = [0.22, 1, 0.36, 1];

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon: Icon,
}) {
  const reducedMotion = useReducedMotionPreference();

  return (
    <motion.div
      className="flex flex-wrap items-start justify-between gap-4"
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span className="icon-chip flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-forest-100 bg-forest-50 text-forest-700">
            <Icon size={21} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest-700">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </motion.div>
  );
}
