"use client";

import type { TripStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "pickup", label: "Pickup", statuses: ["assigned", "en_route_pickup"] as TripStatus[] },
  {
    key: "company",
    label: "Company",
    statuses: ["en_route_company"] as TripStatus[],
  },
  { key: "done", label: "Done", statuses: ["completed"] as TripStatus[] },
] as const;

function stepState(
  stepIndex: number,
  status: TripStatus
): "done" | "current" | "upcoming" {
  if (status === "cancelled") return "upcoming";

  const activeIndex = STEPS.findIndex((s) => s.statuses.includes(status));
  if (activeIndex < 0) return "upcoming";
  if (stepIndex < activeIndex) return "done";
  if (stepIndex === activeIndex) return "current";
  return "upcoming";
}

type StaffTripStatusTimelineProps = {
  status: TripStatus;
  /** `compact` for monitor cards; `default` for driver hub */
  size?: "compact" | "default";
  className?: string;
};

export function StaffTripStatusTimeline({
  status,
  size = "default",
  className,
}: StaffTripStatusTimelineProps) {
  const compact = size === "compact";

  return (
    <div
      className={cn("flex items-center gap-0", className)}
      role="list"
      aria-label="Trip progress"
    >
      {STEPS.map((step, index) => {
        const state = stepState(index, status);
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.key} className="flex min-w-0 flex-1 items-center" role="listitem">
            <div className="flex min-w-0 flex-col items-center gap-0.5">
              <span
                className={cn(
                  "rounded-full border-2",
                  compact ? "size-2" : "size-2.5",
                  state === "done" && "border-emerald-500 bg-emerald-500",
                  state === "current" && "border-primary bg-primary animate-pulse",
                  state === "upcoming" && "border-muted-foreground/30 bg-transparent"
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "truncate text-center leading-none",
                  compact ? "text-[9px]" : "text-[10px]",
                  state === "current"
                    ? "font-semibold text-foreground"
                    : state === "done"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast ? (
              <div
                className={cn(
                  "mx-0.5 h-px flex-1",
                  state === "done" ? "bg-emerald-500/60" : "bg-border"
                )}
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
