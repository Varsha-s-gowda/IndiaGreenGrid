import { Link } from "react-router-dom";
import {
  BatteryCharging,
  CloudSun,
  Database,
  FileText,
  Gauge,
  Leaf,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import ExportButton from "../../components/platform/ExportButton";
import { FreshnessStrip, StatusBadge } from "../../components/platform/DataBadges";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../context/AuthContext";
import useApiData from "../../hooks/useApiData";
import {
  formatDate,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  getDashboardOverview,
  getForecastHistory,
} from "../../services/platformService";

export default function DiscomReportsPage() {
  const { user } = useAuth();
  const overview = useApiData(getDashboardOverview, []);
  const forecasts = useApiData(getForecastHistory, []);

  if (overview.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="DISCOM operations"
          icon={FileText}
          title="Operational reports"
          description="Exportable compliance, capacity and integration tables."
        />
        <ErrorState
          title="Reports unavailable"
          message={overview.error}
          onRetry={overview.reload}
        />
      </div>
    );
  }

  const energy = overview.data?.energy;
  const totals = energy?.totals || {};
  const rpo = overview.data?.rpo;
  const rpoRows = rpo?.yearly_tracker || [];
  const regionalRows = overview.data?.regional || [];
  const sourceRows = (energy?.sources || []).map((source) => ({
    source: source.source_name,
    capacity_mw: source.installed_capacity_mw,
    generation_gwh: source.generation_gwh,
    share_pct: source.share_pct,
  }));
  const forecastRows = (forecasts.data?.items || []).map((item) => ({
    location: item.location,
    state: item.state,
    solar_kwp: item.solar_kwp,
    wind_kwp: item.wind_kwp,
    daily_consumption_kwh: item.daily_consumption_kwh,
    recommended_battery_kwh: item.recommended_battery_kwh,
    backup_hours: item.backup_hours,
    estimated_cost: item.estimated_cost,
    created_at: item.created_at,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="DISCOM operations"
        icon={FileText}
        title="Operational reports"
        description={`Exportable reporting for ${user?.organization || user?.state || "your distribution area"}. Every table is generated from stored backend records.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              overview.reload();
              forecasts.reload();
            }}
            loading={overview.loading || forecasts.loading}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Renewable capacity"
          value={`${formatNumber(totals.renewable_capacity_mw, 0)} MW`}
          detail={`${formatPercent(totals.renewable_capacity_share_pct, 1)} of installed capacity`}
          icon={Zap}
          tone="forest"
          loading={overview.loading && !overview.data}
        />
        <StatCard
          label="Renewable generation"
          value={`${formatNumber(totals.renewable_generation_gwh, 0)} GWh`}
          detail={`Selected year ${energy?.selected_year || "—"}`}
          icon={TrendingUp}
          tone="emerald"
          loading={overview.loading && !overview.data}
        />
        <StatCard
          label="RPO compliance"
          value={formatPercent(rpo?.summary?.overall_compliance_pct, 2)}
          detail={`${formatNumber(rpo?.summary?.target_count, 0)} recorded targets`}
          icon={Target}
          tone="sky"
          loading={overview.loading && !overview.data}
        />
        <StatCard
          label="RPO shortfall"
          value={`${formatNumber(rpo?.summary?.total_shortfall_mwh, 0)} MWh`}
          detail="Across recorded obligations"
          icon={Gauge}
          tone="amber"
          loading={overview.loading && !overview.data}
        />
      </div>

      <Card>
        <CardHeader
          title="RPO yearly tracker"
          description="Required renewable energy, recorded compliance and shortfall by year."
          icon={Target}
          action={
            <ExportButton rows={rpoRows} filename="discom-rpo-yearly.csv" />
          }
        />
        <CardBody>
          {rpoRows.length ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-2 font-semibold">Year</th>
                    <th className="pb-2 text-right font-semibold">Required MWh</th>
                    <th className="pb-2 text-right font-semibold">Recorded MWh</th>
                    <th className="pb-2 text-right font-semibold">Compliance</th>
                    <th className="pb-2 text-right font-semibold">Shortfall MWh</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 text-right font-semibold">Targets</th>
                  </tr>
                </thead>
                <tbody>
                  {rpoRows.map((row) => (
                    <tr key={row.year} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-2.5 font-medium text-slate-800">{row.year}</td>
                      <td className="py-2.5 text-right text-slate-600">
                        {formatNumber(row.required_mwh, 2)}
                      </td>
                      <td className="py-2.5 text-right text-slate-600">
                        {formatNumber(row.actual_mwh, 2)}
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-800">
                        {row.compliance_pct === null
                          ? "—"
                          : formatPercent(row.compliance_pct, 2)}
                      </td>
                      <td className="py-2.5 text-right text-amber-700">
                        {formatNumber(row.shortfall_mwh, 2)}
                      </td>
                      <td className="py-2.5">
                        <StatusBadge value={row.status} />
                      </td>
                      <td className="py-2.5 text-right text-slate-600">
                        {formatNumber(row.target_count, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No RPO targets are recorded for this account yet.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Regional renewable report"
          description="Top states by renewable capacity in the latest sample year."
          icon={Leaf}
          action={
            <ExportButton
              rows={regionalRows}
              filename="discom-regional-renewables.csv"
            />
          }
        />
        <CardBody>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                  <th className="pb-2 font-semibold">State</th>
                  <th className="pb-2 text-right font-semibold">Renewable MW</th>
                  <th className="pb-2 text-right font-semibold">Solar MW</th>
                  <th className="pb-2 text-right font-semibold">Wind MW</th>
                  <th className="pb-2 text-right font-semibold">CO2 avoided (t)</th>
                </tr>
              </thead>
              <tbody>
                {regionalRows.map((row) => (
                  <tr key={row.state} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-2.5 font-medium text-slate-800">{row.state}</td>
                    <td className="py-2.5 text-right text-slate-600">
                      {formatNumber(row.total_renewable_mw, 0)}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {formatNumber(row.solar_capacity_mw, 0)}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {formatNumber(row.wind_capacity_mw, 0)}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {formatNumber(row.co2_avoided_tonnes, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Installed capacity by source"
            description="Source-level capacity and generation for the selected year."
            icon={Zap}
            action={
              <ExportButton
                rows={sourceRows}
                filename="discom-capacity-by-source.csv"
              />
            }
          />
          <CardBody>
            {sourceRows.length ? (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Source</th>
                      <th className="pb-2 text-right font-semibold">Capacity MW</th>
                      <th className="pb-2 text-right font-semibold">Generation GWh</th>
                      <th className="pb-2 text-right font-semibold">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceRows.map((row) => (
                      <tr key={row.source} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2.5 font-medium text-slate-800">
                          {row.source}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(row.capacity_mw, 0)}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(row.generation_gwh, 0)}
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatPercent(row.share_pct, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No source-level capacity data available.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Storage and integration recommendations"
            description="Battery sizing estimates generated from your account."
            icon={BatteryCharging}
            action={
              <ExportButton
                rows={forecastRows}
                filename="discom-storage-recommendations.csv"
              />
            }
          />
          <CardBody>
            {forecastRows.length ? (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      <th className="pb-2 font-semibold">Location</th>
                      <th className="pb-2 text-right font-semibold">Solar</th>
                      <th className="pb-2 text-right font-semibold">Demand</th>
                      <th className="pb-2 text-right font-semibold">Battery</th>
                      <th className="pb-2 text-right font-semibold">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastRows.map((row, index) => (
                      <tr
                        key={`${row.location}-${row.created_at}-${index}`}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="py-2.5">
                          <p className="font-medium text-slate-800">{row.location}</p>
                          <p className="text-[10px] text-slate-400">{row.state}</p>
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(row.solar_kwp, 1)} kWp
                        </td>
                        <td className="py-2.5 text-right text-slate-600">
                          {formatNumber(row.daily_consumption_kwh, 1)} kWh
                        </td>
                        <td className="py-2.5 text-right font-medium text-slate-800">
                          {formatNumber(row.recommended_battery_kwh, 1)} kWh
                        </td>
                        <td className="py-2.5 text-right text-slate-500">
                          {formatDate(row.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No storage recommendations yet.{" "}
                <Link to="/forecast" className="font-semibold text-forest-700">
                  Open the forecast planner
                </Link>
                .
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Data provenance"
          description="Configured sources and their honest freshness labels."
          icon={Database}
          action={
            <Badge
              variant={
                overview.data?.data_summary?.unavailable ? "warning" : "success"
              }
            >
              {overview.data?.data_summary?.fresh ?? 0} fresh ·{" "}
              {overview.data?.data_summary?.unavailable ?? 0} unavailable
            </Badge>
          }
        />
        <CardBody>
          <FreshnessStrip items={overview.data?.data_freshness || []} />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
        <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
          Reports are generated from national sample aggregates, your recorded RPO
          obligations and your own forecast history. Nothing is fabricated when a
          source is unavailable.
        </p>
        <Link to="/discom/dashboard">
          <Button variant="outline" size="sm">
            <CloudSun size={13} />
            Back to DISCOM dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
