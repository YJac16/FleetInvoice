import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Companies",
};

export default function CompaniesPage() {
  return (
    <PlaceholderPage
      title="Companies"
      description="Customer companies used for trip billing and invoice recipients."
      icon={Building2}
      emptyTitle="No companies yet"
      emptyDescription="Company records, contacts, and billing addresses will be managed here."
      cards={[
        {
          title: "Billing contacts",
          description: "People and emails for invoice delivery.",
          badge: "Admin",
        },
        {
          title: "Active accounts",
          description: "Companies currently accepting trips.",
          badge: "Admin",
        },
        {
          title: "Addresses",
          description: "Billing address stored for statements.",
          badge: "Admin",
        },
      ]}
    />
  );
}
