"use client";

import type { ReactNode } from "react";

import { GoOpsLoader } from "@/components/brand/goops-loader";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

export type AdminQuerySnapshot = {
  isLoading: boolean;
  isFetching?: boolean;
  isError?: boolean;
  data?: unknown;
};

/** Initial load, a failed fetch with nothing to show, or ready content. */
export function resolveAdminQueryPhase(
  query: AdminQuerySnapshot
): "loading" | "error" | "ready" {
  const isError = Boolean(query.isError);
  const isFetching = Boolean(query.isFetching);
  const noData =
    query.data == null ||
    (isError && Array.isArray(query.data) && query.data.length === 0);
  if (query.isLoading || (isFetching && noData)) return "loading";
  if (isError && noData) return "error";
  return "ready";
}

export function AdminLoading({
  label = "Loading",
  rows = 5,
  size = "lg",
  skeleton,
  className,
}: {
  label?: string;
  rows?: number;
  size?: "md" | "lg";
  skeleton?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 print:hidden", className)} aria-busy="true">
      <GoOpsLoader size={size} layout="block" label={label} />
      {skeleton ?? <LoadingSkeleton rows={rows} />}
    </div>
  );
}

export function AdminLoadError({
  title = "Couldn't load this",
  description,
  error,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message =
    description ?? getErrorMessage(error, "Check your connection and try again.");

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-card px-6 py-10 text-center",
        className
      )}
    >
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function AdminQueryGate({
  label = "Loading",
  isLoading,
  isFetching = false,
  isError = false,
  data,
  error,
  onRetry,
  rows,
  size = "lg",
  skeleton,
  errorTitle,
  errorDescription,
  children,
}: {
  label?: string;
  isLoading: boolean;
  isFetching?: boolean;
  isError?: boolean;
  data?: unknown;
  error?: unknown;
  onRetry?: () => void;
  rows?: number;
  size?: "md" | "lg";
  skeleton?: ReactNode;
  errorTitle?: string;
  errorDescription?: string;
  children: ReactNode;
}) {
  const phase = resolveAdminQueryPhase({
    isLoading,
    isFetching,
    isError,
    data,
  });

  if (phase === "loading") {
    return (
      <AdminLoading label={label} rows={rows} size={size} skeleton={skeleton} />
    );
  }

  if (phase === "error") {
    return (
      <AdminLoadError
        title={errorTitle}
        description={errorDescription}
        error={error}
        onRetry={onRetry}
      />
    );
  }

  return children;
}
