import { Link } from "react-router-dom";
import { BatteryCharging, Lock, PlayCircle, Settings2 } from "lucide-react";
import Button from "../ui/Button";
import { Card, CardBody } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Skeleton from "../ui/Skeleton";
import { useSolarVault } from "../../context/SolarVaultContext";

export default function SolarVaultState({ children }) {
  const {
    isAdmin,
    summaryLoading,
    summaryError,
    detailLoading,
    detailError,
    notFound,
    simulation,
    refresh,
  } = useSolarVault();

  if ((summaryLoading || detailLoading) && !simulation) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-card"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          ))}
        </div>
        <Card>
          <CardBody className="pt-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-48 w-full" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (summaryError) {
    return (
      <Card>
        <CardBody className="pt-5">
          <ErrorState
            title="SolarVault data unavailable"
            message={summaryError}
            onRetry={refresh}
          />
        </CardBody>
      </Card>
    );
  }

  if (detailError) {
    return (
      <Card>
        <CardBody className="pt-5">
          <ErrorState
            title="Selected simulation unavailable"
            message={detailError}
            onRetry={refresh}
          />
        </CardBody>
      </Card>
    );
  }

  if (notFound && !simulation) {
    return (
      <Card>
        <CardBody className="pt-5">
          <EmptyState
            icon={BatteryCharging}
            title={
              isAdmin
                ? "No SolarVault simulation has been run yet"
                : "No published storage simulation is available yet"
            }
            description={
              isAdmin
                ? "Review the battery assumptions, then run an hourly simulation over a completed SolarTwin run. Charging, discharging, SOC and savings are all computed by the backend."
                : "A society administrator must publish a battery simulation before residents can see storage results. No estimate is shown until then."
            }
            action={
              isAdmin ? (
                <Link to="/solarvault/configuration">
                  <Button size="sm">
                    <PlayCircle size={14} />
                    Open configuration
                  </Button>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Lock size={12} />
                  Resident view — published results only
                </span>
              )
            }
          />
        </CardBody>
      </Card>
    );
  }

  if (!children) {
    return (
      <Card>
        <CardBody className="pt-5">
          <EmptyState
            icon={Settings2}
            title="No simulation selected"
            description="Select a stored simulation or run a new one from the configuration page."
          />
        </CardBody>
      </Card>
    );
  }

  return children;
}
