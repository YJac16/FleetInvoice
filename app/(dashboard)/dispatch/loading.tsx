import { KanbanSkeleton } from "@/components/shared/card-grid-skeleton";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function DispatchLoading() {
  return (
    <div className="space-y-6">
      <LoadingSkeleton rows={1} />
      <LoadingSkeleton rows={2} />
      <KanbanSkeleton />
    </div>
  );
}
