"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageFadeIn({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <div
      {...rest}
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-reduce:animate-none",
        className
      )}
    >
      {children}
    </div>
  );
}
