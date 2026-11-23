import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { BillForm } from "@/features/maintenance/components/bill-form";
import { billToFormValues } from "@/features/maintenance/lib/bill-form-values";
import { getMaintenancePageContext } from "@/features/maintenance/lib/page-context";
import { getBill, getBillFormOptions } from "@/features/maintenance/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditWorkshopBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getMaintenancePageContext("manage");
  const bill = await getBill(ctx.organisationId, id);
  if (!bill) notFound();
  // Approved bills are locked by the RPC; don't offer a form that can't save.
  if (bill.status !== "draft") redirect(`/maintenance/bills/${bill.id}`);

  const options = await getBillFormOptions(ctx.organisationId, {
    supplierId: bill.supplier_id,
    categoryIds: bill.lines.map((l) => l.category_id),
  });

  return (
    <div>
      <PageHeader title={`Edit ${bill.invoice_ref}`} description={bill.supplier_name} />
      <BillForm billId={bill.id} defaultValues={billToFormValues(bill)} options={options} />
    </div>
  );
}
