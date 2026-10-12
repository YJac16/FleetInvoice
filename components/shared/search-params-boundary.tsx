import { Suspense, type ReactNode } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export function SearchParamsBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback ?? <LoadingSkeleton rows={3} />}>
      {children}
    </Suspense>
  );
}
