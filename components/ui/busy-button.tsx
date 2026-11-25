"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BusyButtonProps = ComponentProps<typeof Button> & {
  /** While true the button is disabled, marked aria-busy, and ignores clicks. */
  pending?: boolean;
};

/**
 * Button with press feedback (opacity + scale, 150ms) and a pending state.
 * Opacity/transform only; the motion is dropped under prefers-reduced-motion.
 */
export function BusyButton({
  pending = false,
  disabled,
  onClick,
  className,
  ...props
}: BusyButtonProps) {
  return (
    <Button
      {...props}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cn(
        "motion-safe:transition-[transform,opacity] motion-safe:duration-150 motion-safe:active:scale-[0.97] motion-safe:active:opacity-85",
        "motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:active:opacity-100",
        className
      )}
    />
  );
}
