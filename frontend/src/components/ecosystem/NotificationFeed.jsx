import { Link } from "react-router-dom";
import {
  Bell,
  BellRing,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  Undo2,
} from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { Card, CardBody, CardHeader } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import useApiData from "../../hooks/useApiData";
import { formatRelativeTime } from "../../lib/formatters";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "../../services/ecosystemService";

const CATEGORY_TONES = {
  SOLAR: "forest",
  PROCUREMENT: "info",
  FINANCE: "neutral",
  RECYCLING: "success",
  ORGANISATION: "warning",
  SYSTEM: "neutral",
};

const LINK_ALIASES = {
  "/citizen/solar-requests": "/solar-requests",
  "/citizen/installation-tracking": "/solar-requests",
  "/installer/requests": "/solar-requests",
  "/installer/installations": "/solar-installations",
  "/installer/quotations": "/solar-requests",
  "/citizen/loan-applications": "/loan-applications",
  "/financier/applications": "/loan-applications",
  "/citizen/recycling-requests": "/recycling-requests",
  "/recycler/requests": "/recycling-requests",
  "/supplier/marketplace": "/procurement",
  "/supplier/quotations": "/procurement/quotations",
  "/supplier/contracts": "/procurement/quotations",
  "/discom/compliance": "/compliance",
  "/discom/procurement": "/procurement",
  "/organisation/profile": "/organisation",
};

function resolveLink(link) {
  if (!link) return null;
  return LINK_ALIASES[link] || link;
}

export function NotificationList({ items = [], onRead, onUnread, compact = false }) {
  if (!items.length) {
    return (
      <EmptyState
        compact
        icon={Bell}
        title="You're all caught up"
        description="Workflow updates from installers, institutions, recyclers and administrators appear here."
      />
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li
          key={item.id}
          className={`flex items-start gap-3 py-3 ${item.is_read ? "opacity-70" : ""}`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
              item.is_read
                ? "border-slate-200 bg-slate-50 text-slate-400"
                : "border-forest-100 bg-forest-50 text-forest-700"
            }`}
          >
            {item.is_read ? <Bell size={14} /> : <BellRing size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-xs font-semibold text-slate-900">{item.title}</p>
              <Badge variant={CATEGORY_TONES[item.category] || "neutral"}>
                {item.category}
              </Badge>
              {!item.is_read && <Badge variant="success">New</Badge>}
            </div>
            {item.message && (
              <p className="mt-0.5 text-[11px] leading-5 text-slate-600">{item.message}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-slate-400">
                {formatRelativeTime(item.created_at)}
              </span>
              {resolveLink(item.link) && (
                <Link
                  to={resolveLink(item.link)}
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-forest-700 hover:underline"
                >
                  Open <ExternalLink size={10} />
                </Link>
              )}
              {!compact && (
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-800"
                  onClick={() =>
                    item.is_read ? onUnread?.(item.id) : onRead?.(item.id)
                  }
                >
                  {item.is_read ? <Undo2 size={10} /> : <CheckCheck size={10} />}
                  {item.is_read ? "Mark unread" : "Mark read"}
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function NotificationsSummaryCard({ limit = 5 }) {
  const { data, loading, error, reload } = useApiData(
    () => getNotifications({ pageSize: limit }),
    [limit]
  );
  const items = (data?.items || []).slice(0, limit);

  return (
    <Card>
      <CardHeader
        title="Workflow notifications"
        description="Stored in PostgreSQL for your account."
        icon={Bell}
        action={
          <Link to="/notifications">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        }
      />
      <CardBody>
        {error ? (
          <ErrorState compact title="Notifications unavailable" message={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <NotificationList items={items} compact />
        )}
      </CardBody>
    </Card>
  );
}

export default function NotificationFeed() {
  const { data, loading, error, reload } = useApiData(
    () => getNotifications({ pageSize: 100 }),
    []
  );

  async function read(id) {
    await markNotificationRead(id);
    reload();
  }

  async function unread(id) {
    await markNotificationUnread(id);
    reload();
  }

  async function readAll() {
    await markAllNotificationsRead();
    reload();
  }

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-800">
            {data?.unread_count || 0} unread notification
            {data?.unread_count === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-slate-500">
            Workflow events are recorded for your account only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            loading={loading}
          >
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={readAll}
            disabled={!data?.unread_count}
          >
            <CheckCheck size={13} /> Mark all read
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState title="Notifications unavailable" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="h-64 animate-pulse rounded-xl bg-white shadow-card" />
      ) : (
        <Card>
          <CardBody>
            <NotificationList items={items} onRead={read} onUnread={unread} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
