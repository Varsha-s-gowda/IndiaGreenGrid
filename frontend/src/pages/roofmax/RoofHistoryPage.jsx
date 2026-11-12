import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  History,
  RefreshCw,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import RoofMaxDisclaimer from "../../components/roofmax/RoofMaxDisclaimer";
import RoofMaxPageHeader from "../../components/roofmax/RoofMaxPageHeader";
import RoofMaxToolbar from "../../components/roofmax/RoofMaxToolbar";
import { useRoofMax } from "../../context/RoofMaxContext";
import {
  formatCapacity,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";

export default function RoofHistoryPage() {
  const {
    isAdmin,
    history,
    historyTotal,
    historyLoading,
    historyError,
    refreshHistory,
    refresh,
    detailLoading,
    disclaimer,
    limitations,
  } = useRoofMax();

  return (
    <div className="space-y-6">
      <RoofMaxPageHeader
        icon={History}
        title="Analysis history"
        description={
          isAdmin
            ? "Every stored RoofMax snapshot, including drafts. Each row keeps the exact demand period, configuration version, tariff and assumptions used when it was generated."
            : "Published RoofMax recommendations for the society. Draft analyses are not visible to residents."
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={isAdmin ? "info" : "success"} dot>
              <ShieldCheck size={11} />
              {isAdmin ? "All statuses" : "Published only"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshHistory}
              loading={historyLoading}
            >
              <RefreshCw size={13} />
              Reload
            </Button>
          </div>
        }
      />

      <RoofMaxToolbar onRefresh={refresh} refreshing={detailLoading} />

      {historyError && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="History unavailable"
              message={historyError}
              onRetry={refreshHistory}
            />
          </CardBody>
        </Card>
      )}

      {!historyError && (
        <Card>
          <CardHeader
            title="Stored analyses"
            description={`${formatNumber(historyTotal)} snapshot(s) visible to your role. Select one to inspect its recommendation and scenarios.`}
            icon={History}
            action={
              <span className="text-[11px] text-slate-500">
                Newest first
              </span>
            }
          />
          <CardBody className="pt-1">
            {historyLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-11 w-full" />
                ))}
              </div>
            ) : history.length ? (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-medium">Analysis</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Run</th>
                      <th className="py-2 pr-3 font-medium">Demand period</th>
                      <th className="py-2 pr-3 font-medium">Recommended</th>
                      <th className="py-2 pr-3 font-medium">Coverage</th>
                      <th className="py-2 pr-3 font-medium">Installation</th>
                      <th className="py-2 pr-3 font-medium">Payback</th>
                      <th className="py-2 pr-3 font-medium">Created</th>
                      <th className="py-2 pr-3 font-medium">By</th>
                      <th className="py-2 pr-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 hover:bg-slate-50/70"
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-forest-100 bg-forest-50 text-forest-700">
                              <Target size={13} />
                            </span>
                            <div>
                              <p className="font-semibold text-slate-800">
                                {item.analysis_code}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                #{item.id} · configuration{" "}
                                {item.roof_configuration_id}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <Badge
                            variant={
                              item.status === "PUBLISHED" ? "success" : "warning"
                            }
                            dot
                          >
                            {item.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          #{item.simulation_run_id}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatUtcDate(item.demand_start_date)}
                          <br />
                          <span className="text-[10px] text-slate-400">
                            to {formatUtcDate(item.demand_end_date)} ·{" "}
                            {item.demand_days} days
                          </span>
                        </td>
                        <td className="py-3 pr-3 font-semibold text-slate-800">
                          {formatCapacity(item.recommended_capacity_kwp, 2)}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatPercent(
                            item.recommended_demand_coverage_percentage,
                            1
                          )}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatCurrency(item.installation_cost)}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {item.payback_period_years === null
                            ? "Not recovered"
                            : `${formatNumber(item.payback_period_years, 1)} yr`}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatDateTime(item.created_at)}
                          {item.published_at && (
                            <>
                              <br />
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                                <CheckCircle2 size={10} />
                                published {formatDateTime(item.published_at)}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {item.created_by ? (
                            <span className="inline-flex items-center gap-1">
                              <UserRound size={11} />
                              {item.created_by.name}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <Link
                            to={`/roofmax/recommendation?analysis=${item.id}`}
                            className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-forest-700 hover:text-forest-900"
                          >
                            View
                            <ArrowRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={History}
                title="No analyses for this run"
                description={
                  isAdmin
                    ? "Select another SolarTwin run or generate an analysis from the configuration page."
                    : "No published recommendation exists for this run yet."
                }
                action={
                  isAdmin ? (
                    <Link to="/roofmax/configuration">
                      <Button size="sm">
                        <Target size={14} />
                        Generate analysis
                      </Button>
                    </Link>
                  ) : null
                }
              />
            )}
          </CardBody>
        </Card>
      )}

      <RoofMaxDisclaimer text={disclaimer} limitations={limitations} />
    </div>
  );
}
