"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { useSastDayKey } from "@/hooks/use-sast-day-key";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { useShowListSkeleton } from "@/hooks/use-list-query-skeleton";
import { RangeQueryBody } from "@/components/shared/range-query-body";
import { driverTodayStaffTripRange } from "@/features/driver-portal/lib/driver-today-range";
import { isInstantInRange, resolveDateRange } from "@/lib/date-range/sast-range";
import { primaryRouteQueryMeta } from "@/lib/react-query/primary-route-meta";
import { Button } from "@/components/ui/button";
import { EndTripDialog } from "@/features/driver-portal/components/end-trip-dialog";
import { StaffTripCard } from "@/features/driver-portal/components/staff-trip-card";
import { StartTripDialog } from "@/features/driver-portal/components/start-trip-dialog";
import { nowInDriverTz } from "@/features/driver-portal/lib/dates";
import {
  canAdvanceStaffTrip,
  canEndStaffTrip,
  canStartStaffTrip,
  staffTripActionLabel,
} from "@/features/driver-portal/lib/staff-transitions";
import { DriverComplianceBanner } from "@/features/driver-portal/components/driver-documents-page";
import { StaffTripStatusTimeline } from "@/features/trips/components/staff-trip-status-timeline";
import {
  activeTrip,
  completedTrips,
  upcomingTrips,
} from "@/features/driver-portal/lib/trip-labels";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  advanceStaffTripEnRoute,
  declareNoTripDay,
  endStaffTrip,
  listMyStaffTrips,
  listNoTripDays,
  startStaffTrip,
} from "@/services/staff-trips.service";
import type { StaffTrip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

export function DriverTodayPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canSelf = can("trips:self");
  const sastDayKey = useSastDayKey();
  const today = sastDayKey;
  const { from, toExclusive } = useMemo(() => {
    const noonSast = new Date(`${sastDayKey}T12:00:00+02:00`);
    return driverTodayStaffTripRange(noonSast);
  }, [sastDayKey]);
  const tomorrow = useMemo(() => {
    return nowInDriverTz()
      .year(Number(sastDayKey.slice(0, 4)))
      .month(Number(sastDayKey.slice(5, 7)) - 1)
      .date(Number(sastDayKey.slice(8, 10)))
      .add(1, "day")
      .format("YYYY-MM-DD");
  }, [sastDayKey]);
  const nowLabel = nowInDriverTz().format("HH:mm");
  const todayRange = useMemo(
    () => resolveDateRange("today", null, null, new Date(`${sastDayKey}T12:00:00+02:00`)),
    [sastDayKey]
  );
  const hasTripsToday = (trips: StaffTrip[]) =>
    trips.some((t) => isInstantInRange(t.planned_start, todayRange));

  const [startTarget, setStartTarget] = useState<StaffTrip | null>(null);
  const [endTarget, setEndTarget] = useState<StaffTrip | null>(null);

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTrips(organisationId, from, toExclusive)
      : ["staff-trips", "none"],
    queryFn: () => listMyStaffTrips(organisationId!, from, toExclusive),
    enabled: Boolean(organisationId) && canSelf,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
    meta: primaryRouteQueryMeta,
  });

  const showTripsSkeleton = useShowListSkeleton(tripsQuery);

  const noTripQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.noTripDays(organisationId, today, tomorrow)
      : ["no-trip-days", "none"],
    queryFn: () => listNoTripDays(organisationId!, today, tomorrow),
    enabled: Boolean(organisationId) && canSelf,
  });

  const trips = tripsQuery.data ?? [];
  const active = activeTrip(trips);
  const upcoming = upcomingTrips(trips).filter((t) => t.id !== active?.id);
  const done = completedTrips(trips);
  const declaredNoTrip = (noTripQuery.data ?? []).includes(today);

  const invalidate = async () => {
    if (!organisationId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.staffTrips(organisationId, from, toExclusive),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.noTripDays(organisationId, from, toExclusive),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.staffTripsAdmin(organisationId, from, toExclusive),
      }),
    ]);
  };

  const startMutation = useMutation({
    mutationFn: ({
      tripId,
      openingKm,
      confirmed,
    }: {
      tripId: string;
      openingKm: number;
      confirmed: boolean;
    }) => startStaffTrip(tripId, openingKm, confirmed),
    onSuccess: async () => {
      toast.success("En route to pickup");
      setStartTarget(null);
      await invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const advanceMutation = useMutation({
    mutationFn: advanceStaffTripEnRoute,
    onSuccess: async () => {
      toast.success("En route to company");
      await invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const endMutation = useMutation({
    mutationFn: ({ tripId, closingKm }: { tripId: string; closingKm: number }) =>
      endStaffTrip(tripId, closingKm),
    onSuccess: async () => {
      toast.success("Trip completed");
      setEndTarget(null);
      await invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const noTripMutation = useMutation({
    mutationFn: () => declareNoTripDay(organisationId!),
    onSuccess: async () => {
      toast.success("No trip today recorded");
      await invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const tripCountLabel = useMemo(() => {
    const n = trips.length;
    return `${n} trip${n === 1 ? "" : "s"} · ${nowLabel} SAST`;
  }, [trips.length, nowLabel]);

  if (!canSelf) {
    return (
      <EmptyState
        title="Driver access required"
        description="Ask your admin to link your driver profile."
      />
    );
  }

  if (!organisationId) {
    return (
      <EmptyState
        title="No organisation"
        description="You are not an active member of any organisation."
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Today
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{tripCountLabel}</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          {nowLabel}
        </span>
      </div>

      <DriverComplianceBanner />

      <div className="relative pl-4">
        <div className="absolute bottom-0 left-[5px] top-0 w-px bg-border" />

        {showTripsSkeleton ? (
          <LoadingSkeleton rows={2} />
        ) : (
          <RangeQueryBody query={tripsQuery}>
        {active ? (
          <section className="relative mb-5 space-y-3">
            <div className="relative mb-1">
              <span className="absolute -left-4 top-1 size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Active trip
              </p>
            </div>
            <StaffTripCard trip={active} hideStatus />
            <StaffTripStatusTimeline status={active.status} className="px-1" />
            {canAdvanceStaffTrip(active.status) ? (
              <Button
                className="h-11 w-full text-base"
                disabled={advanceMutation.isPending}
                onClick={() => advanceMutation.mutate(active.id)}
              >
                {staffTripActionLabel(active.status) ?? "Continue"}
                <ChevronRight className="size-4" />
              </Button>
            ) : null}
            {canEndStaffTrip(active.status) ? (
              <Button
                className="h-11 w-full text-base"
                variant="secondary"
                onClick={() => setEndTarget(active)}
              >
                {staffTripActionLabel(active.status) ?? "End trip"}
              </Button>
            ) : null}
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section className="relative mb-5 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Upcoming
            </p>
            {upcoming.map((trip, idx) => (
              <div key={trip.id} className="relative space-y-2">
                <span
                  className={cn(
                    "absolute -left-4 top-4 size-2 rounded-full",
                    idx === 0 && !active ? "bg-violet-500" : "bg-muted-foreground"
                  )}
                />
                <StaffTripCard trip={trip} />
                {idx === 0 && !active && canStartStaffTrip(trip.status) ? (
                  <Button
                    className="h-11 w-full text-base"
                    onClick={() => setStartTarget(trip)}
                  >
                    {staffTripActionLabel(trip.status) ?? "Start trip"}
                    <ChevronRight className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {done.length > 0 ? (
          <section className="relative space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Completed
            </p>
            {done.map((trip) => (
              <StaffTripCard key={trip.id} trip={trip} compact />
            ))}
          </section>
        ) : null}

        {!showTripsSkeleton &&
        !hasTripsToday(trips) &&
        !declaredNoTrip ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-5 text-center">
            <p className="text-sm font-medium text-foreground">
              No trips assigned
            </p>
            <p className="text-xs text-muted-foreground">
              If you are not driving today, record it below.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={noTripMutation.isPending}
              onClick={() => noTripMutation.mutate()}
            >
              {noTripMutation.isPending ? "Saving…" : "No trip today"}
            </Button>
          </div>
        ) : null}

        {declaredNoTrip && !hasTripsToday(trips) ? (
          <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
            <p className="text-sm font-medium text-foreground">No trip today</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You confirmed no assigned trips for today.
            </p>
          </div>
        ) : null}
          </RangeQueryBody>
        )}
      </div>

      <StartTripDialog
        open={Boolean(startTarget)}
        onOpenChange={(open) => !open && setStartTarget(null)}
        trip={startTarget}
        loading={startMutation.isPending}
        onConfirm={(openingKm, confirmed) => {
          if (!startTarget) return;
          startMutation.mutate({
            tripId: startTarget.id,
            openingKm,
            confirmed,
          });
        }}
      />

      <EndTripDialog
        open={Boolean(endTarget)}
        onOpenChange={(open) => !open && setEndTarget(null)}
        trip={endTarget}
        loading={endMutation.isPending}
        onConfirm={(closingKm) => {
          if (!endTarget) return;
          endMutation.mutate({ tripId: endTarget.id, closingKm });
        }}
      />
    </div>
  );
}
