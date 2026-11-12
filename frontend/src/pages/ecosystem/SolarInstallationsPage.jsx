import { useState } from "react";
import { CheckCircle2, RefreshCw, Wrench } from "lucide-react";
import Pagination from "../../components/platform/Pagination";
import { StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import useApiData from "../../hooks/useApiData";
import { formatDate, formatDateTime, formatPercent } from "../../lib/formatters";
import { getSolarInstallations } from "../../services/ecosystemService";

export default function SolarInstallationsPage() {
  const [completed, setCompleted] = useState("All");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApiData(
    () =>
      getSolarInstallations({
        completed: completed === "All" ? undefined : completed === "Completed",
        page,
        pageSize: 20,
      }),
    [completed, page]
  );

  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow A · installations"
        icon={Wrench}
        title="Solar installations"
        description="Commissioned and active installations recorded through accepted quotations."
        actions={
          <Button variant="outline" size="sm" onClick={reload} loading={loading}>
            <RefreshCw size={13} /> Refresh
          </Button>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field h-9 w-auto text-xs"
              value={completed}
              onChange={(event) => {
                setCompleted(event.target.value);
                setPage(1);
              }}
              aria-label="Filter installation completion"
            >
              <option value="All">All installations</option>
              <option value="Active">Active only</option>
              <option value="Completed">Completed only</option>
            </select>
            <Badge variant="neutral">{items.length} on this page</Badge>
          </div>
        </CardBody>
      </Card>

      {error ? (
        <ErrorState title="Installations unavailable" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="h-56 animate-pulse rounded-xl bg-white shadow-card" />
      ) : items.length ? (
        <>
          <Card>
            <CardHeader
              title="Installation register"
              description="Progress is updated by the assigned installer."
              icon={Wrench}
            />
            <CardBody>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Request</th>
                      <th className="pb-2 font-semibold">Installer</th>
                      <th className="pb-2 font-semibold">Status</th>
                      <th className="pb-2 text-right font-semibold">Progress</th>
                      <th className="pb-2 font-semibold">Started</th>
                      <th className="pb-2 font-semibold">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((installation) => (
                      <tr
                        key={installation.id}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-2.5 font-medium text-slate-800">
                          #{installation.request_id}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {installation.installer_name || "—"}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge value={installation.status} />
                        </td>
                        <td className="py-2.5 text-right">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            {formatPercent(installation.progress_pct || 0, 0)}
                            {installation.status === "COMPLETED" && (
                              <CheckCircle2 size={12} className="text-emerald-600" />
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {installation.started_at
                            ? formatDate(installation.started_at)
                            : "—"}
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {installation.completed_at
                            ? formatDateTime(installation.completed_at)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                onChange={setPage}
                label="installations"
              />
            </CardBody>
          </Card>
        </>
      ) : (
        <EmptyState
          icon={Wrench}
          title="No installations recorded"
          description="Installations appear once a requester accepts a quotation."
        />
      )}
    </div>
  );
}
