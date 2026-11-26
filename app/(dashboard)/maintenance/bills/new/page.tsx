import { PageHeader } from "@/components/shared/page-header";
import { BillForm } from "@/features/maintenance/components/bill-form";
import { newBillFormValues } from "@/features/maintenance/lib/bill-form-values";
import { getMaintenancePageContext } from "@/features/maintenance/lib/page-context";
import { getLastPaidIndex } from "@/features/maintenance/lib/insights-queries";
import { getBillFormOptions } from "@/features/maintenance/lib/queries";
import { PORTAL_CLOCK_TIME_ZONE } from "@/lib/time/portal-clock";

export const dynamic = "force-dynamic";

function todayInSast(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: PORTAL_CLOCK_TIME_ZONE }).format(new Date());
}

export default async function NewWorkshopBillPage() {
  const ctx = await getMaintenancePageContext("manage");
  const [baseOptions, lastPaid] = await Promise.all([
    getBillFormOptions(ctx.organisationId),
    getLastPaidIndex(ctx.organisationId),
  ]);
  const options = { ...baseOptions, lastPaid };

  return (
    <div>
      <PageHeader title="New workshop bill" description="VAT is worked out per line." />
      <BillForm billId={null} defaultValues={newBillFormValues(todayInSast())} options={options} />
    </div>
  );
}
