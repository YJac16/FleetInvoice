import type { Metadata } from "next";
import { Receipt } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Invoices",
};

export default function InvoicesPage() {
  return (
    <PlaceholderPage
      title="Invoices"
      description="Weekly invoice batches. Generation and PDFs are out of scope for Phase 1."
      icon={Receipt}
      emptyTitle="No invoices yet"
      emptyDescription="Invoice creation, week windows, and item linking arrive after trip logging."
      cards={[
        {
          title: "Weekly batches",
          description: "Invoices keyed by week start and end.",
          badge: "Admin",
        },
        {
          title: "Status tracking",
          description: "Draft, issued, paid, and void states.",
          badge: "Admin",
        },
        {
          title: "Line items",
          description: "Trips attached via invoice_items.",
          badge: "Phase 2+",
        },
      ]}
    />
  );
}
