import type { Metadata } from "next";
import { Truck } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Trips",
};

export default function TripsPage() {
  return (
    <PlaceholderPage
      title="Trips"
      description="Drivers will submit trips here. Logging and status workflows arrive in Phase 2."
      icon={Truck}
      emptyTitle="No trips yet"
      emptyDescription="Trip capture, validation, and approval flows are not enabled in Phase 1."
      cards={[
        {
          title: "Draft trips",
          description: "Unfinished submissions from the field.",
          badge: "Soon",
        },
        {
          title: "Submitted",
          description: "Awaiting office review and pricing.",
          badge: "Soon",
        },
        {
          title: "Invoiced",
          description: "Trips attached to weekly invoices.",
          badge: "Soon",
        },
      ]}
    />
  );
}
