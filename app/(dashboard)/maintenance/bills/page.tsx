import { Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { BillsExportDialog } from "@/features/maintenance/components/bills-export-dialog";
import { BillsList } from "@/features/maintenance/components/bills-list";
import { MaintenanceTabs } from "@/features/maintenance/components/maintenance-tabs";
import { getMaintenancePageContext } from "@/features/maintenance/lib/page-context";
import { getExportFilterOptions, listBills } from "@/features/maintenance/lib/queries";

export const dynamic = "force-dynamic";

export default async function WorkshopBillsPage() {
  const ctx = await getMaintenancePageContext("view");
  const [bills, exportOptions] = await Promise.all([
    listBills(ctx.organisationId),
    getExportFilterOptions(ctx.organisationId),
  ]);

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Workshop bills from your suppliers."
        actions={
          bills.length > 0 ? (
            <>
              <BillsExportDialog options={exportOptions} />
              {ctx.canManage ? (
                <Button size="lg" render={<Link href="/maintenance/bills/new" />}>
                  <Plus className="size-4" /> Add bill
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <MaintenanceTabs />
      <BillsList bills={bills} canManage={ctx.canManage} />
    </div>
  );
}
