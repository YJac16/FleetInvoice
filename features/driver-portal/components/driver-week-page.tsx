"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import dayjs from "dayjs";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import {
  daysOfWeek,
  formatDayLabel,
  isTodayDate,
  mondayOfWeek,
  todayDateString,
  weekRangeLabel,
} from "@/features/driver-portal/lib/dates";
import { tripsForDay } from "@/features/driver-portal/lib/trip-labels";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  listMyStaffTrips,
  listNoTripDays,
} from "@/services/staff-trips.service";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

export function DriverWeekPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canSelf = can("trips:self");
  const [weekMonday, setWeekMonday] = useState(() => mondayOfWeek());
  const [expandedDay, setExpandedDay] = useState<string | null>(todayDateString());

  const weekDays = useMemo(() => daysOfWeek(weekMonday), [weekMonday]);
  const weekEnd = dayjs(weekMonday).add(7, "day").format("YYYY-MM-DD");

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTrips(organisationId, weekMonday, weekEnd)
      : ["staff-trips", "none"],
    queryFn: () => listMyStaffTrips(organisationId!, weekMonday, weekEnd),
    enabled: Boolean(organisationId) && canSelf,
  });

  const noTripQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.noTripDays(organisationId, weekMonday, weekEnd)
      : ["no-trip-days", "none"],
    queryFn: () => listNoTripDays(organisationId!, weekMonday, weekEnd),
    enabled: Boolean(organisationId) && canSelf,
  });

  const trips = tripsQuery.data ?? [];
  const noTripDays = new Set(noTripQuery.data ?? []);
  const tripCount = trips.length;

  function shiftWeek(delta: number) {
    setWeekMonday(
      dayjs(weekMonday).add(delta * 7, "day").format("YYYY-MM-DD")
    );
  }

  if (!canSelf || !organisationId) {
    return (
      <EmptyState
        title="Driver access required"
        description="Sign in as a linked driver to view your week."
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
            Week
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tripCount} trip{tripCount === 1 ? "" : "s"} this week
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => shiftWeek(-1)}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => shiftWeek(1)}
            aria-label="Next week"
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{weekRangeLabel(weekMonday)}</p>

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <div className="space-y-2">
          {weekDays.map((dateStr) => {
            const dayTrips = tripsForDay(trips, dateStr);
            const isToday = isTodayDate(dateStr);
            const expanded = expandedDay === dateStr;
            const noTrip = noTripDays.has(dateStr);
            const sampleIso = dayTrips[0]?.planned_start ?? `${dateStr}T12:00:00+02:00`;

            if (dayTrips.length === 0) {
              return (
                <div
                  key={dateStr}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm"
                >
                  <span className="min-w-0 truncate text-foreground">
                    {formatDayLabel(sampleIso)}
                    {isToday ? (
                      <span className="ml-2 text-[10px] uppercase text-emerald-700 dark:text-emerald-400">
                        Today
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {noTrip ? "No trip today" : "No trips"}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={dateStr}
                className={cn(
                  "overflow-hidden rounded-xl border border-border bg-card",
                  isToday && "border-foreground/30"
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() =>
                    setExpandedDay(expanded ? null : dateStr)
                  }
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {formatDayLabel(dayTrips[0]!.planned_start)}
                    </span>
                    {isToday ? (
                      <span className="shrink-0 text-[10px] uppercase text-emerald-700 dark:text-emerald-400">
                        Today
                      </span>
                    ) : null}
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {dayTrips.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition",
                      expanded && "rotate-180"
                    )}
                  />
                </button>
                {expanded ? (
                  <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
                    {dayTrips.map((trip) => (
                      <StaffTripCard key={trip.id} trip={trip} compact />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
