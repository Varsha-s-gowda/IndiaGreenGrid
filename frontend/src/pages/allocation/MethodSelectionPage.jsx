import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  GitCompare,
  Info,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import AllocationPageHeader from "../../components/allocation/AllocationPageHeader";
import AllocationToolbar from "../../components/allocation/AllocationToolbar";
import MethodCards from "../../components/allocation/MethodCards";
import MethodComparisonChart from "../../components/allocation/MethodComparisonChart";
import { useAuth } from "../../context/AuthContext";
import { useAllocation } from "../../context/AllocationContext";
import useApiData from "../../hooks/useApiData";
import { METHOD_CAVEATS, METHOD_STEPS } from "../../lib/allocation";
import { getComparison } from "../../services/allocationService";

export default function MethodSelectionPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const {
    runId,
    selectedRun,
    dateFrom,
    dateTo,
    rangeValid,
    runsLoading,
    runsError,
    refresh,
  } = useAllocation();

  const ready = Boolean(runId && dateFrom && dateTo && rangeValid);
  const comparison = useApiData(
    () =>
      getComparison({
        simulation_run_id: runId,
        date_from: dateFrom,
        date_to: dateTo,
        source: "auto",
      }),
    [runId, dateFrom, dateTo],
    { enabled: isAdmin && ready }
  );

  function refreshAll() {
    refresh();
    comparison.reload();
  }

  return (
    <div className="space-y-6">
      <AllocationPageHeader
        icon={Scale}
        title="Allocation methods"
        description="Three transparent policies share the same capped, common-first allocation engine. The backend calculates every figure; this page explains the choices and compares them on identical inputs."
        actions={
          <>
            <Badge variant="forest">
              <ShieldCheck size={11} /> Deterministic Python engine
            </Badge>
            {isAdmin && (
              <Link to="/allocation/compare">
                <Button variant="outline" size="sm">
                  <GitCompare size={13} />
                  Full comparison
                </Button>
              </Link>
            )}
          </>
        }
      />

      {!isAdmin && (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
          <Lock size={15} className="mt-0.5 shrink-0" />
          <p className="leading-5">
            Method comparison is an administrator tool. You can read how each policy
            works, but only an administrator can preview, compare or save a new
            allocation run.
          </p>
        </div>
      )}

      {runsError && (
        <Card>
          <CardBody className="pt-5">
            <ErrorState
              title="SolarTwin runs unavailable"
              message={runsError}
              onRetry={refresh}
            />
          </CardBody>
        </Card>
      )}

      {isAdmin && selectedRun && (
        <>
          <AllocationToolbar
            onRefresh={refreshAll}
            refreshing={comparison.loading}
          />
          {comparison.error ? (
            <Card>
              <CardBody className="pt-5">
                <ErrorState
                  title="Method comparison unavailable"
                  message={comparison.error}
                  onRetry={comparison.reload}
                />
              </CardBody>
            </Card>
          ) : comparison.loading && !comparison.data ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Card key={index}>
                  <CardBody className="space-y-3 pt-5">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-16 w-full" />
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : (
            <>
              <MethodCards
                comparison={comparison.data}
                onSelect={(method) => navigate(`/allocation/run?method=${method}`)}
                selectLabel="Run with this method"
              />
              <MethodComparisonChart
                comparison={comparison.data}
                loading={comparison.loading}
                error={comparison.error}
                onRetry={comparison.reload}
              />
            </>
          )}
        </>
      )}

      {!isAdmin && (
        <MethodCards comparison={null} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="How the engine allocates one hour"
            description="The same four steps apply to every method."
            icon={Info}
          />
          <CardBody>
            <ol className="space-y-3">
              {METHOD_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-50 text-[11px] font-semibold text-forest-700">
                    {index + 1}
                  </span>
                  <p className="pt-0.5 text-xs leading-5 text-slate-600">{step}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
              Conservation is checked after every calculation: total allocation never
              exceeds available solar, no flat exceeds its own demand, and grid import is
              never negative.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Choosing a method is a policy decision"
            description="Read these caveats before saving a run."
            icon={Sparkles}
          />
          <CardBody>
            <ul className="space-y-3">
              {METHOD_CAVEATS.map((caveat) => (
                <li
                  key={caveat}
                  className="flex items-start gap-2 text-[11px] leading-5 text-slate-600"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest-500" />
                  {caveat}
                </li>
              ))}
            </ul>
            {isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Link to="/allocation/run">
                  <Button size="sm">
                    Open run workspace <ArrowRight size={13} />
                  </Button>
                </Link>
                <Link to="/allocation/fairness">
                  <Button variant="outline" size="sm">
                    Fairness analytics
                  </Button>
                </Link>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {isAdmin && comparison.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
          <p className="max-w-2xl text-[11px] leading-5 text-slate-500">
            Comparing methods never overwrites a saved run. Each method has its own
            immutable run identity and input hash, so historical results remain
            auditable.
          </p>
          <Badge variant="info" dot>
            Inputs identical across all three methods
          </Badge>
        </div>
      )}
    </div>
  );
}
