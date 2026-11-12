import { Bell } from "lucide-react";
import NotificationFeed from "../../components/ecosystem/NotificationFeed";
import PageHeader from "../../components/ui/PageHeader";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        icon={Bell}
        title="Notifications"
        description="Real workflow notifications from solar installers, suppliers, lenders, recyclers and administrators."
      />
      <NotificationFeed />
    </div>
  );
}
