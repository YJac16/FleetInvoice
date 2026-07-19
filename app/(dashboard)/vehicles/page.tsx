import type { Metadata } from "next";
import { Car } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Vehicles",
};

export default function VehiclesPage() {
  return (
    <PlaceholderPage
      title="Vehicles"
      description="Fleet register with registration, make, model, and capacity."
      icon={Car}
      emptyTitle="No vehicles registered"
      emptyDescription="Vehicle inventory management will attach to the vehicles table."
      cards={[
        {
          title: "Active fleet",
          description: "Vehicles available for dispatch.",
          badge: "Admin",
        },
        {
          title: "Capacity",
          description: "Payload capacity for planning.",
          badge: "Admin",
        },
        {
          title: "Assignments",
          description: "Drivers linked to a primary vehicle.",
          badge: "Admin",
        },
      ]}
    />
  );
}
