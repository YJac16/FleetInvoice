"use client";

import type { ComponentProps, ReactNode } from "react";

import { GoOpsLoader } from "@/components/brand/goops-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BusyButtonProps = ComponentProps<typeof Button> & {
  pending?: boolean;
  /** Replaces the label while the action is running. */
  pendingLabel?: ReactNode;
};

export function BusyButton({
  pending = false,
  pendingLabel,
  disabled,
  children,
  className,
  ...props
}: BusyButtonProps) {
  return (
    <Button
      {...props}
      className={cn(pending && "disabled:opacity-100", className)}
      disabled={Boolean(disabled) || pending}
      aria-busy={pending || undefined}
      data-pending={pending ? "true" : undefined}
    >
      {pending ? <GoOpsLoader size="xs" decorative /> : null}
      {pending && pendingLabel != null ? pendingLabel : children}
    </Button>
  );
}
