import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Reports",
};

export default function ReportsPage() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Operational and financial reporting surfaces for the office team."
      icon={FileText}
      emptyTitle="Reports coming later"
      emptyDescription="Reporting queries will build on trips, invoices, and audit logs."
      cards={[
        {
          title: "Trip volume",
          description: "Volume by driver, company, and period.",
          badge: "Soon",
        },
        {
          title: "Invoice summary",
          description: "Issued vs paid weekly totals.",
          badge: "Soon",
        },
        {
          title: "Audit trail",
          description: "Security-relevant action history.",
          badge: "Soon",
        },
      ]}
    />
  );
}
