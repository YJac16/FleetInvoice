"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageFadeIn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-reduce:animate-none",
        className
      )}
    >
      {children}
    </div>
  );
}
