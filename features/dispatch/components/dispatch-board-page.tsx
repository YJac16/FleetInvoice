"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useOrg } from "@/components/layout/org-context";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { KanbanSkeleton } from "@/components/shared/card-grid-skeleton";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { useDateRangeFilter } from "@/hooks/use-date-range-filter";
import {
  isRangeQueryRefreshing,
  useShowListSkeleton,
} from "@/hooks/use-list-query-skeleton";
import { RangeQueryBody } from "@/components/shared/range-query-body";
import { useTripsListQuery } from "@/hooks/use-trips-list-query";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DispatchMap } from "@/features/dispatch/components/dispatch-map";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import type { TripStatus } from "@/lib/constants";
import { listGpsLastPositions } from "@/services/gps.service";
import { listPassengersForTrips } from "@/services/trip-passengers.service";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

const KANBAN_COLUMNS: { status: TripStatus; title: string }[] = [
  { status: "planned", title: "Planned" },
  { status: "assigned", title: "Assigned" },
  { status: "in_progress", title: "In progress" },
  { status: "completed", title: "Completed" },
];

export function DispatchBoardPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("dispatch:view") || can("gps:view");
  const { range, setPreset, setCustomRange } = useDateRangeFilter("this_week");

  const positionsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.gpsLastPositions(organisationId)
      : ["gps-last-positions", "none"],
    queryFn: () => listGpsLastPositions(organisationId!),
    enabled: Boolean(organisationId) && canView,
    refetchInterval: 10_000,
  });

  const tripsQuery = useTripsListQuery(organisationId, range, {
    enabled: canView,
    refetchInterval: 15_000,
  });

  const showTripsSkeleton = useShowListSkeleton(tripsQuery);
  const rangeRefreshing = isRangeQueryRefreshing(tripsQuery);
  const filteredTrips = tripsQuery.data ?? [];

  const tripIds = useMemo(
    () => filteredTrips.map((t) => t.id),
    [filteredTrips]
  );

  const passengersQuery = useQuery({
    queryKey: organisationId
      ? ["dispatch-passengers", organisationId, tripIds.join(",")]
      : ["dispatch-passengers", "none"],
    queryFn: () => listPassengersForTrips(organisationId!, tripIds),
    enabled: Boolean(organisationId) && canView && tripIds.length > 0,
    refetchInterval: 20_000,
  });

  const passengerCountByTrip = useMemo(() => {
    const map = new Map<string, { booked: number; capacity: number | null }>();
    for (const trip of tripsQuery.data ?? []) {
      const assignment = trip.trip_assignments?.find((a) => !a.released_at);
      const capacity = assignment?.vehicles?.capacity ?? null;
      map.set(trip.id, { booked: 0, capacity });
    }
    for (const p of passengersQuery.data ?? []) {
      if (p.status === "cancelled") continue;
      const entry = map.get(p.trip_id) ?? { booked: 0, capacity: null };
      entry.booked += 1;
      map.set(p.trip_id, entry);
    }
    return map;
  }, [passengersQuery.data, tripsQuery.data]);

  const markers = useMemo(
    () =>
      (positionsQuery.data ?? []).map((row) => ({
        id: row.driver_id,
        lat: row.latitude,
        lng: row.longitude,
        label: row.drivers?.full_name ?? "Driver",
      })),
    [positionsQuery.data]
  );

  const tripsByStatus = useMemo(() => {
    const map = new Map<TripStatus, typeof tripsQuery.data>();
    for (const col of KANBAN_COLUMNS) map.set(col.status, []);
    for (const trip of filteredTrips) {
      if (trip.status === "cancelled") continue;
      const list = map.get(trip.status as TripStatus);
      if (list) list.push(trip);
    }
    return map;
  }, [filteredTrips]);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Dispatch" description="Live ops board." />
        <EmptyState
          title="No access"
          description="Dispatcher or GPS view permission is required."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="Dispatch" description="Live ops board." />
        <EmptyState
          title="No organisation"
          description="Select an organisation to open the dispatch board."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch"
        description="Last-known driver positions and trip status. Map refreshes about every 10 seconds."
      />

      <DateRangeFilter
        range={range}
        onPresetChange={setPreset}
        onCustomChange={setCustomRange}
        updating={rangeRefreshing}
      />

      <DispatchMap markers={markers} />

      <div>
        <h2 className="mb-3 font-heading text-lg">Driver positions</h2>
        {positionsQuery.isLoading ? (
          <LoadingSkeleton rows={2} />
        ) : (positionsQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No live positions"
            description="Ask drivers to share location from the driver portal."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(positionsQuery.data ?? []).map((row) => (
              <li
                key={row.driver_id}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {row.drivers?.full_name ?? "Driver"}
                </div>
                <div className="text-muted-foreground">
                  {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(row.recorded_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-heading text-lg">Trip board</h2>
        {showTripsSkeleton ? (
          <KanbanSkeleton />
        ) : (
          <RangeQueryBody query={tripsQuery}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {KANBAN_COLUMNS.map((col) => (
              <Card key={col.status}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{col.title}</CardTitle>
                  <CardDescription>
                    {(tripsByStatus.get(col.status) ?? []).length} trips
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(tripsByStatus.get(col.status) ?? []).slice(0, 12).map(
                    (trip) => {
                      const seats = passengerCountByTrip.get(trip.id);
                      return (
                      <div
                        key={trip.id}
                        className="rounded-md border px-2 py-1.5 text-sm"
                      >
                        <div className="font-medium">
                          {trip.routes?.name ?? "Trip"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(trip.planned_start)}
                        </div>
                        {seats ? (
                          <div className="text-xs text-muted-foreground">
                            {seats.booked}
                            {seats.capacity != null
                              ? ` / ${seats.capacity}`
                              : ""}{" "}
                            seats
                          </div>
                        ) : null}
                        <StatusBadge status={trip.status} />
                      </div>
                    );
                    }
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          </RangeQueryBody>
        )}
      </div>
    </div>
  );
}
