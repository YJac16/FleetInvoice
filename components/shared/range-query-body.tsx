"use client";

import type { ReactNode } from "react";

import { isRangeQueryRefreshing } from "@/hooks/use-list-query-skeleton";
import { cn } from "@/lib/utils";

export function RangeQueryBody<TData>({
  query,
  children,
  className,
}: {
  query: {
    isFetching: boolean;
    isPlaceholderData: boolean;
  };
  children: ReactNode;
  className?: string;
}) {
  const refreshing = isRangeQueryRefreshing(query);

  return (
    <div
      className={cn(
        "relative motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none",
        refreshing && "pointer-events-none opacity-60",
        className
      )}
      aria-busy={refreshing}
    >
      {children}
    </div>
  );
}
