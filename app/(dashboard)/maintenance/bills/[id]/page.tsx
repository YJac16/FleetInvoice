import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { BillDetailView } from "@/features/maintenance/components/bill-detail";
import { BillStatusBadge } from "@/features/maintenance/components/bill-status-badge";
import { getMaintenancePageContext } from "@/features/maintenance/lib/page-context";
import { getBill } from "@/features/maintenance/lib/queries";

export const dynamic = "force-dynamic";

export default async function WorkshopBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getMaintenancePageContext("view");
  const bill = await getBill(ctx.organisationId, id);
  if (!bill) notFound();

  return (
    <div>
      <Link
        href="/maintenance/bills"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Workshop bills
      </Link>
      <PageHeader
        title={bill.invoice_ref}
        description={bill.supplier_name}
        actions={
          <>
            <BillStatusBadge status={bill.status} />
            {ctx.canManage && bill.status === "draft" ? (
              <Button size="lg" variant="outline" render={<Link href={`/maintenance/bills/${bill.id}/edit`} />}>
                <Pencil className="size-4" /> Edit
              </Button>
            ) : null}
          </>
        }
      />
      <BillDetailView bill={bill} canManage={ctx.canManage} />
    </div>
  );
}
