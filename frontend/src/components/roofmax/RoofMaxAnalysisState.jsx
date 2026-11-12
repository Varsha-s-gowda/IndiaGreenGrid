import { Link } from "react-router-dom";
import { Lock, PlayCircle, Ruler, Settings2 } from "lucide-react";
import Button from "../ui/Button";
import { Card, CardBody } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Skeleton from "../ui/Skeleton";
import { useRoofMax } from "../../context/RoofMaxContext";

export default function RoofMaxAnalysisState({ children }) {
  const { isAdmin, detailLoading, detailError, notFound, refresh } = useRoofMax();

  if (detailLoading) {
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

  if (detailError) {
    return (
      <Card>
        <CardBody className="pt-5">
          <ErrorState
            title="RoofMax data unavailable"
            message={detailError}
            onRetry={refresh}
          />
        </CardBody>
      </Card>
    );
  }

  if (notFound) {
    return (
      <Card>
        <CardBody className="pt-5">
          <EmptyState
            icon={Ruler}
            title={
              isAdmin
                ? "No RoofMax analysis has been generated yet"
                : "No published recommendation is available yet"
            }
            description={
              isAdmin
                ? "Review the roof and financial assumptions, then generate an analysis from a completed SolarTwin run. Demand, generation and financials are all computed by the backend."
                : "A society administrator must publish a capacity analysis before residents can see the recommendation. No estimate is shown until then."
            }
            action={
              isAdmin ? (
                <Link to="/roofmax/configuration">
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
            title="No analysis selected"
            description="Select a stored analysis or generate a new one from the configuration page."
          />
        </CardBody>
      </Card>
    );
  }

  return children;
}
