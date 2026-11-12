import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  Gauge,
  Home,
  RefreshCw,
  ShieldCheck,
  Timer,
  Wifi,
} from "lucide-react";
import LatencyChart from "../components/dashboard/LatencyChart";
import ModuleStatusGrid from "../components/dashboard/ModuleStatusGrid";
import WelcomeCard from "../components/dashboard/WelcomeCard";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { useAuth } from "../context/AuthContext";
import { useHealth } from "../context/HealthContext";
import { formatDate, formatDateTime, formatLatency, formatTime } from "../lib/formatters";

export default function ResidentDashboardPage() {
  const { user, isAdmin } = useAuth();
  const {
    health,
    database,
    status,
    error,
    loading,
    refreshing,
    refresh,
    lastChecked,
    samples,
  } = useHealth();

  const apiValue =
    status === "online"
      ? "Online"
      : status === "degraded"
        ? "Degraded"
        : status === "offline"
          ? "Offline"
          : "Checking";

  return (
    <div className="space-y-6">
      <WelcomeCard user={user} isAdmin={isAdmin} />

      <PageHeader
        eyebrow="Resident"
        title={`Hello, ${user?.name || "Resident"}`}
        description="This is your solar workspace. Authentication and live system status are connected; apartment allocation and billing data will appear once those modules are implemented."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} loading={refreshing}>
            <RefreshCw size={13} />
            Refresh status
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Account"
          value="Resident"
          detail={user?.email}
          icon={Home}
          tone="emerald"
          loading={loading}
        />
        <StatCard
          label="Account created"
          value={user?.created_at ? formatDate(user.created_at) : "—"}
          detail="Registration date from /api/auth/me"
          icon={CalendarDays}
          tone="forest"
          loading={loading}
        />
        <StatCard
          label="API status"
          value={apiValue}
          detail={health ? `${health.app} v${health.version}` : error || "Awaiting health check"}
          icon={Wifi}
          tone={status === "online" ? "emerald" : status === "offline" ? "rose" : "amber"}
          loading={loading}
        />
        <StatCard
          label="Database latency"
          value={formatLatency(database?.latency_ms)}
          detail={lastChecked ? `Checked ${formatTime(lastChecked)}` : "No sample yet"}
          icon={Timer}
          tone="sky"
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader
          title="Your solar workspace"
          description="Every module below is protected and available to your resident role."
          icon={ShieldCheck}
        />
        <CardBody>
          <ModuleStatusGrid />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Live platform responsiveness"
            description="Real API and database timings recorded by the session health poller."
            icon={Gauge}
            action={
              <Badge variant={status === "online" ? "success" : status === "offline" ? "danger" : "warning"} dot>
                {samples.length} samples
              </Badge>
            }
          />
          <CardBody>
            <LatencyChart />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your apartment" icon={Building2} />
          <CardBody>
            <EmptyState
              icon={Building2}
              compact
              title="Apartment not linked yet"
              description="Apartment records, ownership shares and consumption history are not exposed by the backend in this release. Once those APIs exist, your allocation and billing details will appear here."
              action={
                <Link
                  to="/allocation"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700 hover:gap-2"
                >
                  View solar allocation
                  <ArrowRight size={12} />
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Connection detail" description="Live values from the FastAPI health endpoints." icon={Activity} />
          <CardBody className="space-y-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">API</span>
              <span className="text-xs font-medium text-slate-800">
                {health ? `${health.status} · ${health.environment}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Database</span>
              <span className="text-xs font-medium text-slate-800">
                {database ? `${database.dialect} · ${database.database}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs text-slate-500">Last checked</span>
              <span className="text-xs font-medium text-slate-800">
                {lastChecked ? formatDateTime(lastChecked) : "Not yet"}
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Signed-in resident" description="Identity returned by /api/auth/me." icon={Home} />
          <CardBody className="space-y-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Name</span>
              <span className="text-xs font-medium text-slate-800">{user?.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Email</span>
              <span className="truncate text-xs font-medium text-slate-800">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs text-slate-500">Role</span>
              <Badge variant="success">RESIDENT</Badge>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
