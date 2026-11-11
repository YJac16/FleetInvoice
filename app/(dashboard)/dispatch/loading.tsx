import { AdminLoading } from "@/components/admin/admin-loading";
import { KanbanSkeleton } from "@/components/shared/card-grid-skeleton";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function DispatchLoading() {
  return (
    <AdminLoading
      label="Loading dispatch"
      skeleton={
        <>
          <LoadingSkeleton rows={1} />
          <LoadingSkeleton rows={2} />
          <KanbanSkeleton />
        </>
      }
    />
  );
}
