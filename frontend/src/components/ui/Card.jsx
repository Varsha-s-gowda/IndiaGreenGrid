import { motion } from "framer-motion";
import { useReducedMotionPreference } from "../effects/usePointerCapability";

const EASE_OUT = [0.22, 1, 0.36, 1];

export function Card({ className = "", children, reveal = true, ...props }) {
  const reducedMotion = useReducedMotionPreference();
  const classes = `premium-card relative rounded-xl border border-slate-200 bg-white shadow-card ${className}`;

  if (!reveal || reducedMotion) {
    return (
      <div className={classes} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={classes}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -48px 0px" }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className = "",
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5 ${className}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="icon-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-700">
            <Icon size={17} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className = "", children }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

export function CardFooter({ className = "", children }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 ${className}`}
    >
      {children}
    </div>
  );
}
