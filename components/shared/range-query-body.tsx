"use client";

import type { ReactNode } from "react";

import { isRangeQueryRefreshing } from "@/hooks/use-list-query-skeleton";
import { cn } from "@/lib/utils";

export function RangeQueryBody<TData>({
  query,
  refreshing: refreshingProp,
  children,
  className,
}: {
  query: {
    isFetching: boolean;
    isPlaceholderData: boolean;
  };
  /** When true, stale list rows are non-interactive (matches DateRangeFilter “Updating…”). */
  refreshing?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const refreshing =
    refreshingProp ?? isRangeQueryRefreshing(query);

  return (
    <div
      className={cn(
        "relative motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none",
        refreshing && "pointer-events-none opacity-60",
        className
      )}
      aria-busy={refreshing || undefined}
      {...(refreshing ? { inert: true } : {})}
    >
      {children}
    </div>
  );
}
