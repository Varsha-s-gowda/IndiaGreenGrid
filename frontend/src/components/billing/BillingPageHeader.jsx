import PageHeader from "../ui/PageHeader";
import BillingTabs from "./BillingTabs";

export default function BillingPageHeader({
  icon,
  title,
  description,
  actions,
  eyebrow = "BillFair billing",
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
      <BillingTabs />
    </div>
  );
}
