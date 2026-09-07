"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  pathCoordinatesFromGpsPoints,
  staffTripLiveMarkers,
} from "@/features/driver-portal/lib/gps";
import { staffTripStatusLabel } from "@/features/driver-portal/lib/staff-transitions";
import { StaffTripGpsMap } from "@/features/trips/components/staff-trip-gps-map";
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
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

const MONITOR_COLUMNS: StaffTripStatus[] = [
  "assigned",
  "en_route_pickup",
  "en_route_company",
  "completed",
];

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
    <div className="space-y-6">
      <PageHeader
        title="Staff transport monitor"
        description="Live en-route status and GPS for today’s staff trips."
      />

      {canViewGps ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg">Live map</h2>
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
                {liveMarkers.length === 1 ? "" : "s"} on en-route trips
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
              className="h-[360px] w-full overflow-hidden rounded-xl border"
              emptyMessage={
                playbackTripId
                  ? "No GPS trail recorded for this trip."
                  : "No live positions for en-route trips."
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MONITOR_COLUMNS.map((status) => {
            const columnTrips = grouped.get(status) ?? [];
            return (
              <section
                key={status}
                className="rounded-xl border bg-card p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold leading-snug">
                    {staffTripStatusLabel(status)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {columnTrips.length}
                  </span>
                </div>
                {columnTrips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-2">
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

                      return (
                        <li
                          key={trip.id}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm",
                            isPlayback && "border-primary ring-1 ring-primary/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium">
                                {trip.staff_company
                                  ? STAFF_TRANSPORT_COMPANY_LABELS[
                                      trip.staff_company as StaffTransportCompany
                                    ]
                                  : "—"}
                              </p>
                              <p className="text-muted-foreground">
                                {formatDateTime(trip.planned_start)}
                              </p>
                              <p className="truncate text-muted-foreground">
                                {trip.area_text}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {trip.pax_count ?? 0} pax
                                {trip.total_km != null
                                  ? ` · ${trip.total_km} km`
                                  : trip.opening_km != null
                                    ? ` · open ${trip.opening_km} km`
                                    : ""}
                              </p>
                            </div>
                            <StatusBadge status={trip.status} />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span
                                className={cn(
                                  "size-2 rounded-full",
                                  online ? "bg-emerald-500" : "bg-zinc-400"
                                )}
                                title={online ? "Online" : "Offline"}
                              />
                              <span className="text-muted-foreground">
                                {driverName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {canViewGps && status === "completed" ? (
                                <Button
                                  size="xs"
                                  variant={isPlayback ? "default" : "ghost"}
                                  onClick={() =>
                                    setPlaybackTripId(isPlayback ? null : trip.id)
                                  }
                                >
                                  {isPlayback ? "Hide path" : "View path"}
                                </Button>
                              ) : null}
                              {canManage && canCancelStaffTrip(trip.status) ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  className="text-destructive"
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
