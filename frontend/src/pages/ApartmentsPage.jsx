import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Layers,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import ErrorState from "../components/ui/ErrorState";
import PageHeader from "../components/ui/PageHeader";
import Skeleton from "../components/ui/Skeleton";
import StatCard from "../components/ui/StatCard";
import useApiData from "../hooks/useApiData";
import { PROFILE_LABELS } from "../lib/energy";
import { formatNumber } from "../lib/formatters";
import { getApartmentSummary, getApartments } from "../services/solarTwinService";

export default function ApartmentsPage() {
  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState("all");

  const resource = useApiData(async () => {
    const [list, summary] = await Promise.all([
      getApartments({ limit: 500 }),
      getApartmentSummary(),
    ]);
    return { list, summary };
  }, []);

  const apartments = resource.data?.list?.items || [];
  const summary = resource.data?.summary || null;

  const floors = useMemo(
    () =>
      [...new Set(apartments.map((apartment) => apartment.floor_number))].sort(
        (left, right) => left - right
      ),
    [apartments]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toUpperCase();
    return apartments.filter((apartment) => {
      const matchesFloor =
        floor === "all" || String(apartment.floor_number) === String(floor);
      const matchesSearch =
        !term || apartment.flat_number.toUpperCase().includes(term);
      return matchesFloor && matchesSearch;
    });
  }, [apartments, search, floor]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        icon={Building2}
        title="Apartments management"
        description="The seeded 60-flat inventory, household profiles and resident counts returned by /api/apartments."
        actions={
          <>
            <Badge variant="forest">
              <ShieldCheck size={11} /> Administrator only
            </Badge>
            <Link to="/simulation/apartments">
              <Button variant="outline" size="sm">
                Consumption analytics
                <ArrowRight size={13} />
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Apartments"
          value={formatNumber(summary?.total_apartments ?? 0)}
          detail={`${formatNumber(floors.length)} floors in the registry`}
          icon={Building2}
          tone="forest"
          loading={resource.loading}
        />
        <StatCard
          label="Residents"
          value={formatNumber(summary?.total_residents ?? 0)}
          detail="Household residents recorded"
          icon={Users}
          tone="emerald"
          loading={resource.loading}
        />
        <StatCard
          label="Average household"
          value={formatNumber(summary?.average_residents_per_apartment ?? 0, 2)}
          detail="Residents per apartment"
          icon={Layers}
          tone="sky"
          loading={resource.loading}
        />
        <StatCard
          label="Categories"
          value={formatNumber(
            Object.keys(summary?.apartments_by_category || {}).length
          )}
          detail="Apartment size categories"
          icon={Layers}
          tone="slate"
          loading={resource.loading}
        />
      </div>

      {resource.error ? (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="Apartment data unavailable"
              message={resource.error}
              onRetry={resource.reload}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Apartment records"
            description={`${formatNumber(filtered.length)} of ${formatNumber(
              apartments.length
            )} apartments shown.`}
            icon={Building2}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="search"
                    className="field h-9 w-44 pl-8 text-xs"
                    placeholder="Search flat number"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="Search apartment by flat number"
                  />
                </div>
                <select
                  className="field h-9 w-32 text-xs"
                  value={floor}
                  onChange={(event) => setFloor(event.target.value)}
                  aria-label="Filter by floor"
                >
                  <option value="all">All floors</option>
                  {floors.map((floorNumber) => (
                    <option key={floorNumber} value={floorNumber}>
                      Floor {floorNumber}
                    </option>
                  ))}
                </select>
              </div>
            }
          />
          <CardBody className="px-0 pb-0">
            {resource.loading ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            ) : !filtered.length ? (
              <div className="px-5 pb-5">
                <EmptyState
                  icon={Building2}
                  title="No matching apartments"
                  description="Adjust the search term or floor filter. If the registry is empty, run the backend seed script."
                  compact
                />
              </div>
            ) : (
              <div className="max-h-[34rem] overflow-auto scrollbar-thin">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">Flat</th>
                      <th className="px-3 py-2.5 font-semibold">Floor</th>
                      <th className="px-3 py-2.5 font-semibold">Category</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Residents</th>
                      <th className="px-5 py-2.5 font-semibold">Consumption profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((apartment) => (
                      <tr key={apartment.id} className="border-t border-slate-100">
                        <td className="px-5 py-2.5 font-medium text-slate-800">
                          {apartment.flat_number}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {apartment.floor_number}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {apartment.apartment_category}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500">
                          {apartment.residents_count}
                        </td>
                        <td className="px-5 py-2.5">
                          <Badge variant="neutral">
                            {PROFILE_LABELS[apartment.consumption_profile] ||
                              apartment.consumption_profile}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader
            title="Household profile distribution"
            description="Profile counts returned by /api/apartments/summary."
            icon={Layers}
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Object.entries(summary.apartments_by_profile || {}).map(
                ([profile, count]) => (
                  <div
                    key={profile}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-3"
                  >
                    <p className="text-xs font-medium text-slate-700">
                      {PROFILE_LABELS[profile] || profile}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {formatNumber(count)}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      apartments
                    </p>
                  </div>
                )
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
