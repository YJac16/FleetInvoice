import { Skeleton } from "@/components/ui/skeleton";

export function CardGridSkeleton({
  cards = 4,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div
      className={className ?? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}
    >
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-border/80 bg-card p-4"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-full max-w-[12rem]" />
        </div>
      ))}
    </div>
  );
}

export function KanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: columns }).map((_, col) => (
        <div key={col} className="space-y-2 rounded-xl border bg-card p-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
