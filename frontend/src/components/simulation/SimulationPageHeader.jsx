import PageHeader from "../ui/PageHeader";
import SimulationTabs from "./SimulationTabs";

export default function SimulationPageHeader({
  icon,
  title,
  description,
  actions,
  eyebrow = "SolarTwin",
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={eyebrow}
        icon={icon}
        title={title}
        description={description}
        actions={actions}
      />
      <SimulationTabs />
    </div>
  );
}
