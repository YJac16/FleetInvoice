import { ReportsPage } from "@/features/reports/components/reports-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ReportsPage
      title="Company reports"
      description="Period summaries for your scoped companies (fuel, trips, invoices where visible)."
      showMasterCounts={false}
    />
  );
}
