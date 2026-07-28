import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <LoadingSkeleton rows={1} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LoadingSkeleton rows={2} />
        <LoadingSkeleton rows={2} />
        <LoadingSkeleton rows={2} />
        <LoadingSkeleton rows={2} />
      </div>
    </div>
  );
}
