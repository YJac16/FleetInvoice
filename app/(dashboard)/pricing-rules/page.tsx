import type { Metadata } from "next";
import { Tags } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Pricing Rules",
};

export default function PricingRulesPage() {
  return (
    <PlaceholderPage
      title="Pricing Rules"
      description="Company-specific pricing rules. Drivers cannot view this module."
      icon={Tags}
      emptyTitle="No pricing rules"
      emptyDescription="Rule calculation engines are intentionally deferred past Phase 1."
      cards={[
        {
          title: "Company rules",
          description: "Named rules scoped to a company.",
          badge: "Admin",
        },
        {
          title: "Protected access",
          description: "Blocked for driver roles via RLS and middleware.",
          badge: "Secure",
        },
        {
          title: "Future rates",
          description: "Rate tables will extend this foundation.",
          badge: "Phase 2+",
        },
      ]}
    />
  );
}
