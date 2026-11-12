import { Link } from "react-router-dom";
import { SlidersHorizontal, Sun } from "lucide-react";
import Button from "../ui/Button";
import { Card, CardBody } from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import { useAuth } from "../../context/AuthContext";

export default function NoSimulationState({
  title = "No simulation data yet",
  description = "Generate a SolarTwin simulation to populate the energy dashboard with stored PostgreSQL readings.",
}) {
  const { isAdmin } = useAuth();

  return (
    <Card>
      <CardBody className="pt-5">
        <EmptyState
          icon={Sun}
          title={title}
          description={
            isAdmin
              ? description
              : "An administrator must generate a simulation before resident analytics become available."
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
