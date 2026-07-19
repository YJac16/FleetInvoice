import type { Metadata } from "next";
import { Users } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Drivers",
};

export default function DriversPage() {
  return (
    <PlaceholderPage
      title="Drivers"
      description="Manage driver profiles, licences, and assigned vehicles."
      icon={Users}
      emptyTitle="No drivers listed"
      emptyDescription="Driver CRUD and assignment tools will connect to the drivers table next."
      cards={[
        {
          title: "Active drivers",
          description: "Drivers available for trip assignment.",
          badge: "Admin",
        },
        {
          title: "Vehicle links",
          description: "Primary vehicle per driver record.",
          badge: "Admin",
        },
        {
          title: "Employee numbers",
          description: "Unique identifiers for payroll and audit.",
          badge: "Admin",
        },
      ]}
    />
  );
}
