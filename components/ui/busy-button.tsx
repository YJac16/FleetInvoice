"use client";

import type { ComponentProps, ReactNode } from "react";

import { GoOpsLoader } from "@/components/brand/goops-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BusyButtonProps = ComponentProps<typeof Button> & {
  /** While true the button is disabled, marked aria-busy, and ignores clicks. */
  pending?: boolean;
  /** Replaces the label while the action is running. */
  pendingLabel?: ReactNode;
};

/**
 * The one busy button. Shows the GoOps mark while `pending`, swaps in
 * `pendingLabel`, and ignores clicks. Press feedback is opacity + transform
 * only (150ms); both the press scale and the loader animation are dropped
 * under prefers-reduced-motion (the loader stays as a static mark).
 */
export function BusyButton({
  pending = false,
  pendingLabel,
  disabled,
  onClick,
  children,
  className,
  ...props
}: BusyButtonProps) {
  return (
    <Button
      {...props}
      aria-busy={pending || undefined}
      data-pending={pending ? "true" : undefined}
      disabled={Boolean(disabled) || pending}
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
        pending && "disabled:opacity-100",
        className
      )}
    >
      {pending ? <GoOpsLoader size="xs" decorative /> : null}
      {pending && pendingLabel != null ? pendingLabel : children}
    </Button>
  );
}
