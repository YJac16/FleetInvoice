"use client";

import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { getErrorMessage } from "@/utils/errors";

export function RangeListErrorState({
  title,
  error,
  onRetry,
  icon,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  icon?: LucideIcon;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={getErrorMessage(error)}
      actionLabel="Retry"
      onAction={onRetry}
    />
  );
}
