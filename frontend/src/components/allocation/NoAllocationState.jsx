import { Link } from "react-router-dom";
import { Scale, SlidersHorizontal } from "lucide-react";
import Button from "../ui/Button";
import { Card, CardBody } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import { useAuth } from "../../context/AuthContext";

export default function NoAllocationState({
  title = "No SolarTwin data yet",
  description = "Generate a SolarTwin simulation before allocations can be previewed or saved.",
}) {
  const { isAdmin } = useAuth();

  return (
    <Card>
      <CardBody className="pt-5">
        <EmptyState
          icon={Scale}
          title={title}
          description={
            isAdmin
              ? description
              : "An administrator must generate a SolarTwin simulation and save an allocation before resident figures become available."
          }
          action={
            isAdmin ? (
              <Link to="/simulation/control">
                <Button size="sm">
                  <SlidersHorizontal size={13} />
                  Open simulation control
                </Button>
              </Link>
            ) : undefined
          }
        />
      </CardBody>
    </Card>
  );
}
