import { AdminLoading } from "@/components/admin/admin-loading";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function InvoicesLoading() {
  return (
    <AdminLoading
      label="Loading invoices"
      skeleton={
        <>
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={5} />
        </>
      }
    />
  );
}
