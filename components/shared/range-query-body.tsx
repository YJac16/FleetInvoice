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
        refreshing && [
          "pointer-events-none opacity-60",
          "[&_a]:pointer-events-none [&_a]:cursor-not-allowed [&_a]:opacity-50",
          "[&_button]:pointer-events-none [&_button]:cursor-not-allowed [&_button]:opacity-50",
        ],
        className
      )}
      aria-busy={refreshing || undefined}
      {...(refreshing ? { inert: true } : {})}
    >
      {children}
    </div>
  );
}
