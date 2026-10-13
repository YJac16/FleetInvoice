import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function RangeListPrimaryLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("font-semibold leading-snug text-foreground", className)}>
      {children}
    </p>
  );
}

export function RangeListSecondaryLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-xs leading-snug text-muted-foreground", className)}>
      {children}
    </p>
  );
}
