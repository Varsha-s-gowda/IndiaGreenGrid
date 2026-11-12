import PageHeader from "../ui/PageHeader";
import SolarVaultTabs from "./SolarVaultTabs";

export default function SolarVaultPageHeader({
  icon,
  title,
  description,
  actions,
  eyebrow = "SolarVault battery storage",
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
      <SolarVaultTabs />
    </div>
  );
}
