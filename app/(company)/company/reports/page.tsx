import { ReportsPage } from "@/features/reports/components/reports-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ReportsPage
      title="Company reports"
      description="Trips and invoices for your company."
      showMasterCounts={false}
      allowedKinds={["trips", "commercial"]}
      hidePayroll
    />
  );
}
