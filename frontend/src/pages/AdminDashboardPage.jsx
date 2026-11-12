import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Building2,
  Database,
  Gauge,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Timer,
  Wifi,
} from "lucide-react";
import ModuleStatusGrid from "../components/dashboard/ModuleStatusGrid";
import LatencyChart from "../components/dashboard/LatencyChart";
import WelcomeCard from "../components/dashboard/WelcomeCard";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { useAuth } from "../context/AuthContext";
import { useHealth } from "../context/HealthContext";
import {
  formatDateTime,
  formatLatency,
  formatTime,
} from "../lib/formatters";

export default function AdminDashboardPage() {
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
    status === "online" ? "Operational" : status === "degraded" ? "Degraded" : status === "offline" ? "Offline" : "Checking";

  return (
    <div className="space-y-6">
      <WelcomeCard user={user} isAdmin={isAdmin} />

      <PageHeader
        eyebrow="Administrator"
        title={`Good to see you, ${user?.name || "Admin"}`}
        description="Monitor the live backend connection, database readiness and the status of every registered solar module. No analytics are simulated."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} loading={refreshing}>
            <RefreshCw size={13} />
            Refresh health
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="API status"
          value={apiValue}
          detail={health ? `${health.app} v${health.version}` : error || "Awaiting first health check"}
          icon={Wifi}
          tone={status === "online" ? "emerald" : status === "offline" ? "rose" : "amber"}
          loading={loading}
        />
        <StatCard
          label="Database"
          value={database ? database.status.toUpperCase() : status === "offline" ? "Unreachable" : "Checking"}
          detail={database ? `${database.dialect} · ${database.database}` : "PostgreSQL connection"}
          icon={Database}
          tone={database ? "emerald" : status === "offline" ? "rose" : "slate"}
          loading={loading}
        />
        <StatCard
          label="Database latency"
          value={formatLatency(database?.latency_ms)}
          detail={lastChecked ? `Checked ${formatTime(lastChecked)}` : "No sample yet"}
          icon={Timer}
          tone="forest"
          loading={loading}
        />
        <StatCard
          label="Session samples"
          value={samples.length}
          detail="Live health polls recorded in this session"
          icon={Activity}
          tone="sky"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Live response latency"
            description="Real API and PostgreSQL response times captured by the health poller."
            icon={Gauge}
            action={
              <Badge variant={status === "online" ? "success" : status === "offline" ? "danger" : "warning"} dot>
                {status === "online" ? "Healthy" : status === "offline" ? "Offline" : "Degraded"}
              </Badge>
            }
          />
          <CardBody>
            <LatencyChart />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Connection detail"
            description="Values returned by the FastAPI health endpoints."
            icon={ServerCog}
          />
          <CardBody className="space-y-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Environment</span>
              <span className="text-xs font-medium text-slate-800">
                {health?.environment || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">API endpoint</span>
              <code className="text-[11px] text-slate-700">GET /api/health</code>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Database endpoint</span>
              <code className="text-[11px] text-slate-700">GET /api/health/database</code>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Last checked</span>
              <span className="text-xs font-medium text-slate-800">
                {lastChecked ? formatDateTime(lastChecked) : "Not yet"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs text-slate-500">Auto refresh</span>
              <span className="text-xs font-medium text-slate-800">Every 30 seconds</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Solar module readiness"
          description="Each card reflects the live response from its protected backend status endpoint."
          icon={ShieldCheck}
          action={
            <Link
              to="/simulation"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 hover:gap-2"
            >
              Open simulation
              <ArrowRight size={12} />
            </Link>
          }
        />
        <CardBody>
          <ModuleStatusGrid />
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Management" description="Administrator-only workspace areas." icon={Building2} />
          <CardBody className="space-y-2">
            <Link
              to="/apartments"
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3 text-xs font-medium text-slate-700 transition hover:border-forest-200 hover:bg-forest-50/40"
            >
              <span className="inline-flex items-center gap-2">
                <Building2 size={15} className="text-forest-700" />
                Apartments management
              </span>
              <ArrowRight size={13} className="text-slate-400" />
            </Link>
            <Link
              to="/settings"
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3 text-xs font-medium text-slate-700 transition hover:border-forest-200 hover:bg-forest-50/40"
            >
              <span className="inline-flex items-center gap-2">
                <ServerCog size={15} className="text-forest-700" />
                Account & workspace settings
              </span>
              <ArrowRight size={13} className="text-slate-400" />
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Signed-in administrator" description="Identity returned by /api/auth/me." icon={ShieldCheck} />
          <CardBody className="space-y-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Name</span>
              <span className="text-xs font-medium text-slate-800">{user?.name}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Email</span>
              <span className="truncate text-xs font-medium text-slate-800">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5">
              <span className="text-xs text-slate-500">Role</span>
              <Badge variant="forest">ADMIN</Badge>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs text-slate-500">Account created</span>
              <span className="text-xs font-medium text-slate-800">
                {user?.created_at ? formatDateTime(user.created_at) : "—"}
              </span>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
