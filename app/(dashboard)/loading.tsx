import { CardGridSkeleton } from "@/components/shared/card-grid-skeleton";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <LoadingSkeleton rows={1} />
      <CardGridSkeleton cards={5} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" />
      <CardGridSkeleton />
    </div>
  );
}
