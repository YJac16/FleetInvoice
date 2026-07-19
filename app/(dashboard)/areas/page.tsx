import type { Metadata } from "next";
import { MapPinned } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Areas",
};

export default function AreasPage() {
  return (
    <PlaceholderPage
      title="Areas"
      description="Service areas and zones used for routing and future pricing."
      icon={MapPinned}
      emptyTitle="No areas defined"
      emptyDescription="Area and zone configuration will be added before pricing rules go live."
      cards={[
        {
          title: "Named areas",
          description: "Human-readable delivery area names.",
          badge: "Admin",
        },
        {
          title: "Zones",
          description: "Grouping for pricing and reporting.",
          badge: "Admin",
        },
        {
          title: "Active coverage",
          description: "Areas currently available for trips.",
          badge: "Admin",
        },
      ]}
    />
  );
}
