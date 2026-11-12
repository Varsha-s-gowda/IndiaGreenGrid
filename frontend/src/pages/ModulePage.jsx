import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, Terminal } from "lucide-react";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import PageHeader from "../components/ui/PageHeader";
import Skeleton from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage } from "../lib/apiError";
import { findModuleByPath } from "../lib/modules";
import { getModuleStatus, getSimulationAdminStatus } from "../services/moduleService";
import NotFoundPage from "./NotFoundPage";

function StatusRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2.5 last:border-b-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-800">{children}</span>
    </div>
  );
}

export default function ModulePage() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const module = findModuleByPath(location.pathname);

  const [status, setStatus] = useState(null);
  const [adminStatus, setAdminStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!module) return;
    setLoading(true);
    setError("");
    setAdminStatus(null);

    try {
      const result = await getModuleStatus(module.key);
      setStatus(result);

      if (module.key === "simulation" && isAdmin) {
        try {
          setAdminStatus(await getSimulationAdminStatus());
        } catch {
          setAdminStatus(null);
        }
      }
    } catch (requestError) {
      setStatus(null);
      setError(
        getApiErrorMessage(requestError, "Unable to reach this module endpoint.")
      );
    } finally {
      setLoading(false);
    }
  }, [module, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!module) return <NotFoundPage />;

  const Icon = module.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        icon={Icon}
        title={module.name}
        description={module.description}
        actions={
          <Button variant="outline" size="sm" onClick={load} loading={loading}>
            <RefreshCw size={13} />
            Refresh status
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Module readiness"
              description="Live response from the protected FastAPI module endpoint."
              icon={Terminal}
              action={
                loading ? (
                  <Badge variant="neutral" dot>Checking</Badge>
                ) : error ? (
                  <Badge variant="danger" dot>Unreachable</Badge>
                ) : status?.available ? (
                  <Badge variant="success" dot>Available</Badge>
                ) : (
                  <Badge variant="warning" dot>Planned</Badge>
                )
              }
            />
            <CardBody>
              {loading ? (
                <div className="space-y-2.5">
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="mt-4 h-20 w-full" />
                </div>
              ) : error ? (
                <ErrorState
                  compact
                  title="Module endpoint unavailable"
                  message={error}
                  onRetry={load}
                />
              ) : (
                <>
                  <div className="mb-4">
                    <StatusRow label="Endpoint">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                        GET /api{module.endpoint}
                      </code>
                    </StatusRow>
                    <StatusRow label="Module key">
                      <code className="text-[11px]">{status?.module || module.key}</code>
                    </StatusRow>
                    <StatusRow label="Reported status">
                      <Badge variant={status?.available ? "success" : "warning"}>
                        {status?.status || "unknown"}
                      </Badge>
                    </StatusRow>
                    <StatusRow label="Available">
                      {status?.available ? "Yes" : "No"}
                    </StatusRow>
                    <StatusRow label="Authentication">
                      Bearer JWT required
                    </StatusRow>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Backend message
                    </p>
                    <p className="mt-1 text-xs leading-6 text-slate-700">
                      {status?.message || "No message returned by the backend."}
                    </p>
                  </div>

                  {module.key === "simulation" && isAdmin && (
                    <div className="mt-3 rounded-lg border border-forest-100 bg-forest-50/60 px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-forest-700">
                        <ShieldCheck size={12} />
                        Admin controls endpoint
                      </p>
                      <p className="mt-1 text-xs leading-6 text-forest-900">
                        {adminStatus
                          ? adminStatus.message
                          : "GET /api/simulation/admin/status did not return a response."}
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Module data"
              description="This area will populate once the backend module is implemented."
            />
            <CardBody>
              <EmptyState
                icon={Clock3}
                title={module.emptyTitle}
                description={module.emptyDescription}
                compact
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Planned capabilities" icon={Icon} />
            <CardBody>
              <ul className="space-y-2.5">
                {module.planned.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-xs text-slate-600">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-slate-300" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
                These capabilities are on the roadmap. No simulated values or
                placeholder analytics are displayed.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Access" icon={ShieldCheck} />
            <CardBody className="space-y-2.5">
              <p className="text-xs leading-6 text-slate-600">
                This module is available to authenticated ADMIN and RESIDENT users.
                Requests require the JWT issued by <code className="text-[11px]">/api/auth/login</code>.
              </p>
              <Badge variant={isAdmin ? "forest" : "success"}>
                {isAdmin ? "Administrator access" : "Resident access"}
              </Badge>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
