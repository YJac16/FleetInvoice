import { AdminLoading } from "@/components/admin/admin-loading";
import { KanbanSkeleton } from "@/components/shared/card-grid-skeleton";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function StaffTransportLoading() {
  return (
    <AdminLoading
      label="Loading staff transport"
      skeleton={
        <>
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={1} />
          <KanbanSkeleton columns={4} />
        </>
      }
    />
  );
}
