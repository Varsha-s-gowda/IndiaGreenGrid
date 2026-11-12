import { Link } from "react-router-dom";
import {
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  GitCompare,
  History,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import SolarVaultDisclaimer from "../../components/solarvault/SolarVaultDisclaimer";
import SolarVaultPageHeader from "../../components/solarvault/SolarVaultPageHeader";
import SolarVaultToolbar from "../../components/solarvault/SolarVaultToolbar";
import { useSolarVault } from "../../context/SolarVaultContext";
import {
  formatCurrency,
  formatDateTime,
  formatEnergy,
  formatNumber,
  formatPercent,
  formatUtcDate,
} from "../../lib/formatters";

export default function BatteryHistoryPage() {
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
  } = useSolarVault();

  return (
    <div className="space-y-6">
      <SolarVaultPageHeader
        icon={History}
        title="Simulation history"
        description={
          isAdmin
            ? "Every stored SolarVault snapshot, including drafts. Each row keeps the exact run, configuration version, battery parameters, tariff and hourly dispatch it was produced with."
            : "Published battery simulations for the society. Draft simulations are not visible to residents."
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

      <SolarVaultToolbar
        onRefresh={refresh}
        refreshing={detailLoading}
        showSimulationSelect={false}
      />

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
            title="Stored simulations"
            description={`${formatNumber(
              historyTotal
            )} snapshot(s) visible to your role. Select one to inspect its dispatch and comparison.`}
            icon={History}
            action={
              <span className="text-[11px] text-slate-500">Newest first</span>
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
                      <th className="py-2 pr-3 font-medium">Simulation</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Run</th>
                      <th className="py-2 pr-3 font-medium">Period</th>
                      <th className="py-2 pr-3 font-medium">Capacity</th>
                      <th className="py-2 pr-3 font-medium">Final SOC</th>
                      <th className="py-2 pr-3 font-medium">Grid import</th>
                      <th className="py-2 pr-3 font-medium">Reduction</th>
                      <th className="py-2 pr-3 font-medium">Savings</th>
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
                              <BatteryCharging size={13} />
                            </span>
                            <div>
                              <p className="font-semibold text-slate-800">
                                {item.simulation_code}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                #{item.id} · configuration{" "}
                                {item.battery_configuration_id} ·{" "}
                                {formatNumber(item.hour_count)} h
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <Badge
                            variant={
                              item.status === "PUBLISHED"
                                ? "success"
                                : "warning"
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
                          {formatUtcDate(item.period_start)}
                          <br />
                          <span className="text-[10px] text-slate-400">
                            to {formatUtcDate(item.period_end)}
                          </span>
                        </td>
                        <td className="py-3 pr-3 font-semibold text-slate-800">
                          {formatEnergy(item.capacity_kwh, 1)}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatPercent(item.final_soc_pct, 1)}
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatEnergy(item.grid_import_kwh, 2)}
                          <br />
                          <span className="text-[10px] text-slate-400">
                            baseline{" "}
                            {formatEnergy(item.baseline_grid_import_kwh, 2)}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatEnergy(item.grid_reduction_kwh, 2)}
                          <br />
                          <span className="text-[10px] text-slate-400">
                            {formatPercent(item.grid_reduction_pct, 1)}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-slate-600">
                          {formatCurrency(item.estimated_savings)}
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
                          <div className="flex flex-col items-end gap-1">
                            <Link
                              to={`/solarvault?simulation=${item.id}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-forest-700 hover:text-forest-900"
                            >
                              Open
                              <ArrowRight size={12} />
                            </Link>
                            <Link
                              to={`/solarvault/comparison?simulation=${item.id}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-slate-500 hover:text-slate-800"
                            >
                              <GitCompare size={10} />
                              Compare
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={History}
                title="No simulations for this run"
                description={
                  isAdmin
                    ? "Select another SolarTwin run or run a simulation from the configuration page."
                    : "No published storage simulation exists for this run yet."
                }
                action={
                  isAdmin ? (
                    <Link to="/solarvault/configuration">
                      <Button size="sm">
                        <BatteryCharging size={14} />
                        Run simulation
                      </Button>
                    </Link>
                  ) : null
                }
              />
            )}
          </CardBody>
        </Card>
      )}

      <SolarVaultDisclaimer text={disclaimer} limitations={limitations} />
    </div>
  );
}
