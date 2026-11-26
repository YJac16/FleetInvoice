import { PageHeader } from "@/components/shared/page-header";
import { MaintenanceTabs } from "@/features/maintenance/components/maintenance-tabs";
import { SupplierFormDialog } from "@/features/maintenance/components/supplier-form-dialog";
import { SuppliersList } from "@/features/maintenance/components/suppliers-list";
import { getMaintenancePageContext } from "@/features/maintenance/lib/page-context";
import { listSuppliers } from "@/features/maintenance/lib/queries";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const ctx = await getMaintenancePageContext("view");
  const suppliers = await listSuppliers(ctx.organisationId);
  const add = ctx.canManage ? <SupplierFormDialog /> : undefined;

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Workshops and parts suppliers."
        actions={suppliers.length > 0 ? add : undefined}
      />
      <MaintenanceTabs showWorthKeeping={ctx.isAdmin} />
      <SuppliersList suppliers={suppliers} action={add} />
    </div>
  );
}
