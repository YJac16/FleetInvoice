"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  pathCoordinatesFromGpsPoints,
  staffTripLiveMarkers,
} from "@/features/driver-portal/lib/gps";
import { staffTripStatusLabel } from "@/features/driver-portal/lib/staff-transitions";
import { StaffTripGpsMap } from "@/features/trips/components/staff-trip-gps-map";
import { StaffTripStatusTimeline } from "@/features/trips/components/staff-trip-status-timeline";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  STAFF_TRIP_STATUSES,
  STAFF_TRANSPORT_COMPANY_LABELS,
  type StaffTripStatus,
  type StaffTransportCompany,
} from "@/lib/constants";
import {
  listGpsLastPositions,
  listGpsPointsForTrip,
} from "@/services/gps.service";
import {
  cancelStaffTrip,
  isDriverOnline,
  listDriverPresence,
  listStaffTripsForAdmin,
} from "@/services/staff-trips.service";
import type { DriverPresence, StaffTrip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

const MONITOR_COLUMNS: StaffTripStatus[] = [
  "assigned",
  "en_route_pickup",
  "en_route_company",
  "completed",
];

const COLUMN_ACCENT: Record<StaffTripStatus, string> = {
  assigned: "border-l-zinc-400",
  en_route_pickup: "border-l-amber-500",
  en_route_company: "border-l-blue-500",
  completed: "border-l-emerald-500",
  cancelled: "border-l-red-500",
};

function groupByStatus(trips: StaffTrip[]) {
  const map = new Map<string, StaffTrip[]>();
  for (const status of STAFF_TRIP_STATUSES) map.set(status, []);
  for (const trip of trips) {
    const list = map.get(trip.status) ?? [];
    list.push(trip);
    map.set(trip.status, list);
  }
  return map;
}

function canCancelStaffTrip(status: StaffTrip["status"]): boolean {
  return (
    status === "assigned" ||
    status === "en_route_pickup" ||
    status === "en_route_company"
  );
}

export function StaffTripsMonitorPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("trips:manage");
  const canViewGps = can("gps:view") || can("dispatch:view") || canManage;
  const queryClient = useQueryClient();

  const today = dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");

  const [playbackTripId, setPlaybackTripId] = useState<string | null>(null);

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTripsAdmin(organisationId, today, tomorrow)
      : ["staff-trips-admin", "none"],
    queryFn: () => listStaffTripsForAdmin(organisationId!, today, tomorrow),
    enabled: Boolean(organisationId),
    refetchInterval: 15_000,
  });

  const presenceQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.driverPresence(organisationId)
      : ["driver-presence", "none"],
    queryFn: () => listDriverPresence(organisationId!),
    enabled: Boolean(organisationId),
    refetchInterval: 30_000,
  });

  const positionsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.gpsLastPositions(organisationId)
      : ["gps-last-positions", "none"],
    queryFn: () => listGpsLastPositions(organisationId!),
    enabled: Boolean(organisationId) && canViewGps,
    refetchInterval: 10_000,
  });

  const playbackQuery = useQuery({
    queryKey:
      organisationId && playbackTripId
        ? queryKeys.gpsPointsForTrip(organisationId, playbackTripId)
        : ["gps-points-trip", "none"],
    queryFn: () => listGpsPointsForTrip(organisationId!, playbackTripId!),
    enabled: Boolean(organisationId) && Boolean(playbackTripId) && canViewGps,
  });

  const presenceByDriver = useMemo(() => {
    const map = new Map<string, DriverPresence>();
    for (const p of presenceQuery.data ?? []) {
      map.set(p.driver_id, p);
    }
    return map;
  }, [presenceQuery.data]);

  const trips = tripsQuery.data ?? [];
  const grouped = groupByStatus(trips);

  const liveMarkers = useMemo(
    () => staffTripLiveMarkers(trips, positionsQuery.data ?? []),
    [trips, positionsQuery.data]
  );

  const summary = useMemo(() => {
    const enRoute =
      (grouped.get("en_route_pickup")?.length ?? 0) +
      (grouped.get("en_route_company")?.length ?? 0);
    return {
      total: trips.length,
      assigned: grouped.get("assigned")?.length ?? 0,
      enRoute,
      completed: grouped.get("completed")?.length ?? 0,
      liveDrivers: liveMarkers.length,
    };
  }, [trips.length, grouped, liveMarkers.length]);

  const playbackPath = useMemo(() => {
    if (!playbackTripId || !playbackQuery.data?.length) return [];
    return [
      {
        id: playbackTripId,
        coordinates: pathCoordinatesFromGpsPoints(playbackQuery.data),
        color: "#2563eb",
      },
    ];
  }, [playbackTripId, playbackQuery.data]);

  const mapMarkers = playbackTripId ? [] : liveMarkers;
  const mapPaths = playbackTripId ? playbackPath : [];

  const cancelMutation = useMutation({
    mutationFn: cancelStaffTrip,
    onSuccess: async () => {
      toast.success("Trip cancelled");
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.staffTripsAdmin(organisationId, today, tomorrow),
        });
      }
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (!organisationId) {
    return (
      <EmptyState
        title="Select an organisation"
        description="Choose an organisation to monitor staff trips."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff transport monitor"
        description="Control room · live status and GPS for today’s staff trips."
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Radio className="size-3 text-emerald-500" aria-hidden />
          {summary.total} trip{summary.total === 1 ? "" : "s"} today
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {summary.assigned} assigned
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-medium text-amber-600 dark:text-amber-400">
          {summary.enRoute} en route
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          {summary.completed} done
        </span>
        {canViewGps && !playbackTripId ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {summary.liveDrivers} GPS live
            </span>
          </>
        ) : null}
      </div>

      {canViewGps ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-base font-semibold">Live map</h2>
              {!playbackTripId && summary.liveDrivers > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live
                </span>
              ) : null}
            </div>
            {playbackTripId ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPlaybackTripId(null)}
              >
                Back to live
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {liveMarkers.length} driver
                {liveMarkers.length === 1 ? "" : "s"} reporting GPS
              </p>
            )}
          </div>
          {playbackTripId && playbackQuery.isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : (
            <StaffTripGpsMap
              markers={mapMarkers}
              paths={mapPaths}
              fitToPathId={playbackTripId}
              className="h-[340px] w-full overflow-hidden rounded-lg border"
              emptyMessage={
                playbackTripId
                  ? "No GPS trail recorded for this trip."
                  : "No en-route drivers reporting GPS. Positions appear when trips are en route."
              }
            />
          )}
          {playbackTripId ? (
            <p className="text-xs text-muted-foreground">
              Path playback for completed trip
              {playbackQuery.data?.length
                ? ` · ${playbackQuery.data.length} points`
                : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MONITOR_COLUMNS.map((status) => {
            const columnTrips = grouped.get(status) ?? [];
            return (
              <section
                key={status}
                className={cn(
                  "rounded-lg border border-l-4 bg-card p-3",
                  COLUMN_ACCENT[status]
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {staffTripStatusLabel(status)}
                  </h2>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                      columnTrips.length > 0
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {columnTrips.length}
                  </span>
                </div>
                {columnTrips.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No trips in this stage
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {columnTrips.map((trip) => {
                      const driverId =
                        trip.trip_assignments?.find((a) => !a.released_at)
                          ?.driver_id ?? null;
                      const driverName =
                        trip.trip_assignments?.find((a) => !a.released_at)
                          ?.drivers?.full_name ?? "—";
                      const presence = driverId
                        ? presenceByDriver.get(driverId)
                        : undefined;
                      const online = isDriverOnline(presence);
                      const isPlayback = playbackTripId === trip.id;
                      const companyLabel = trip.staff_company
                        ? STAFF_TRANSPORT_COMPANY_LABELS[
                            trip.staff_company as StaffTransportCompany
                          ]
                        : "—";

                      return (
                        <li
                          key={trip.id}
                          className={cn(
                            "rounded-md border bg-background/60 px-2.5 py-2 text-sm",
                            isPlayback && "border-primary ring-1 ring-primary/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-1">
                                <p className="truncate font-medium leading-tight">
                                  {companyLabel}
                                </p>
                                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                                  {dayjs(trip.planned_start).format("HH:mm")}
                                </span>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {trip.area_text}
                              </p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {trip.pax_count ?? 0} pax
                                {trip.total_km != null
                                  ? ` · ${trip.total_km} km`
                                  : trip.opening_km != null
                                    ? ` · ${trip.opening_km} km`
                                    : ""}
                              </p>
                            </div>
                          </div>
                          <StaffTripStatusTimeline
                            status={trip.status}
                            size="compact"
                            className="mt-2"
                          />
                          <div className="mt-1.5 flex items-center justify-between gap-1">
                            <div className="flex min-w-0 items-center gap-1.5 text-[10px]">
                              <span
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  online ? "bg-emerald-500" : "bg-zinc-400"
                                )}
                                title={online ? "Online" : "Offline"}
                              />
                              <span className="truncate text-muted-foreground">
                                {driverName}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {canViewGps && status === "completed" ? (
                                <Button
                                  size="xs"
                                  variant={isPlayback ? "default" : "ghost"}
                                  className="h-6 px-1.5 text-[10px]"
                                  onClick={() =>
                                    setPlaybackTripId(isPlayback ? null : trip.id)
                                  }
                                >
                                  {isPlayback ? "Hide" : "Path"}
                                </Button>
                              ) : null}
                              {canManage && canCancelStaffTrip(trip.status) ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-[10px] text-destructive"
                                  disabled={cancelMutation.isPending}
                                  onClick={() => cancelMutation.mutate(trip.id)}
                                >
                                  Cancel
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          Read-only view. Dispatchers can assign trips from the Trips page.
        </p>
      ) : null}
    </div>
  );
}
