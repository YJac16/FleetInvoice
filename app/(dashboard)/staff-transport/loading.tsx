import { KanbanSkeleton } from "@/components/shared/card-grid-skeleton";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function StaffTransportLoading() {
  return (
    <div className="space-y-4">
      <LoadingSkeleton rows={1} />
      <LoadingSkeleton rows={1} />
      <KanbanSkeleton columns={4} />
    </div>
  );
}
