import PageHeader from "../ui/PageHeader";
import RoofMaxTabs from "./RoofMaxTabs";

export default function RoofMaxPageHeader({
  icon,
  title,
  description,
  actions,
  eyebrow = "RoofMax capacity planning",
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
      <RoofMaxTabs />
    </div>
  );
}
