import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function TripsLoading() {
  return (
    <div className="space-y-4">
      <LoadingSkeleton rows={1} />
      <LoadingSkeleton rows={6} />
    </div>
  );
}
