import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  History as HistoryIcon,
  Info,
} from "lucide-react";
import Badge from "../ui/Badge";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { useNotifications } from "../../context/NotificationContext";
import { formatDateTime, formatRelativeTime } from "../../lib/formatters";

const NOTIFICATION_TONES = {
  success: "success",
  error: "danger",
  warning: "warning",
  info: "info",
};

export function WelcomeBanner({
  eyebrow,
  title,
  description,
  user,
  badges = [],
  stats = [],
  actions,
  notice,
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-forest-900/10 bg-gradient-to-br from-forest-950 via-forest-900 to-forest-800 p-6 text-white shadow-card sm:p-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 20%, rgba(52,211,153,0.45), transparent 45%), radial-gradient(circle at 10% 90%, rgba(16,185,129,0.35), transparent 50%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          {description && (
            <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-100/80">
              {description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {user?.name && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90">
                {user.name}
              </span>
            )}
            {user?.organization && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90">
                {user.organization}
              </span>
            )}
            {user?.state && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90">
                {user.state}
              </span>
            )}
            {badges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-100"
              >
                {badge}
              </span>
            ))}
          </div>
          {notice && (
            <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-5 text-emerald-100/70">
              <Info size={12} className="mt-0.5 shrink-0" />
              {notice}
            </p>
          )}
          {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        </div>

        {stats.length > 0 && (
          <div className="grid w-full max-w-sm grid-cols-2 gap-3 sm:w-auto sm:gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur ${
                  stat.wide ? "col-span-2" : ""
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/90">
                  {stat.label}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {stat.value}
                  {stat.unit && (
                    <span className="ml-1 text-xs font-normal text-emerald-200/80">
                      {stat.unit}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuickActionsCard({
  actions = [],
  title = "Quick actions",
  description = "The actions available in your workspace.",
}) {
  if (!actions.length) return null;
  return (
    <Card>
      <CardHeader title={title} description={description} icon={ArrowRight} />
      <CardBody className="space-y-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition hover:border-forest-200 hover:bg-forest-50/40"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {Icon && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-forest-100 bg-forest-50 text-forest-700">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800">
                    {action.label}
                  </span>
                  {action.detail && (
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                      {action.detail}
                    </span>
                  )}
                </span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-slate-400" />
            </Link>
          );
        })}
      </CardBody>
    </Card>
  );
}

export function NotificationsCard({
  title = "Your notifications",
  description = "Session alerts raised by your own actions.",
  limit = 5,
}) {
  const { notifications } = useNotifications();
  const items = notifications.slice(0, limit);

  return (
    <Card>
      <CardHeader title={title} description={description} icon={Bell} />
      <CardBody>
        {items.length ? (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-800">
                    {item.title}
                    <Badge variant={NOTIFICATION_TONES[item.type] || "neutral"}>
                      {item.type}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                    {item.message}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">
            No session notifications yet. Alerts appear here when you run an action
            in your workspace.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function ActivityCard({
  items = [],
  title = "Recent activity",
  description = "Audit entries recorded for your account.",
  limit = 6,
  emptyMessage = "No activity recorded yet.",
}) {
  const rows = items.slice(0, limit);
  return (
    <Card>
      <CardHeader title={title} description={description} icon={HistoryIcon} />
      <CardBody>
        {rows.length ? (
          <ul className="space-y-2">
            {rows.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-800">
                    {item.description}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {item.user_email} · {item.module}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {formatDateTime(item.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">{emptyMessage}</p>
        )}
      </CardBody>
    </Card>
  );
}
