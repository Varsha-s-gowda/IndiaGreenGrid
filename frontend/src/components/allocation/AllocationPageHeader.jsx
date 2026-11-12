import PageHeader from "../ui/PageHeader";
import AllocationTabs from "./AllocationTabs";

export default function AllocationPageHeader({
  icon,
  title,
  description,
  actions,
  eyebrow = "Solar allocation",
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
      <AllocationTabs />
    </div>
  );
}
