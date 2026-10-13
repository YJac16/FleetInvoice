import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function InvoicesLoading() {
  return (
    <div className="space-y-4">
      <LoadingSkeleton rows={1} />
      <LoadingSkeleton rows={5} />
    </div>
  );
}
