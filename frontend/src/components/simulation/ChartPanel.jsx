import { BarChart3 } from "lucide-react";
import { Card, CardBody, CardHeader } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import ErrorState from "../ui/ErrorState";
import Skeleton from "../ui/Skeleton";

export default function ChartPanel({
  title,
  description,
  icon = BarChart3,
  action,
  loading = false,
  error = "",
  onRetry,
  empty = false,
  emptyTitle = "No data in this range",
  emptyDescription = "Adjust the date range or generate simulation data to populate this chart.",
  height = "h-72",
  className = "",
  children,
}) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
      />
      <CardBody>
        {loading ? (
          <div className={`flex ${height} flex-col justify-end gap-2`}>
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-full w-full" />
          </div>
        ) : error ? (
          <ErrorState compact title="Chart data unavailable" message={error} onRetry={onRetry} />
        ) : empty ? (
          <EmptyState
            icon={BarChart3}
            title={emptyTitle}
            description={emptyDescription}
            compact
          />
        ) : (
          children
        )}
      </CardBody>
    </Card>
  );
}
