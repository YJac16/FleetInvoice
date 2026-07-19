import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function RootLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <LoadingSkeleton />
    </div>
  );
}
