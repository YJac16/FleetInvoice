"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canTransition } from "@/features/trips/lib/transitions";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import type { TripEventType } from "@/lib/constants";
import { listMyDriverTrips } from "@/services/trip-assignments.service";
import {
  listPassengersForTrips,
  mapsDirectionsUrl,
  pickupNavTarget,
  type PassengerWithNav,
} from "@/services/trip-passengers.service";
import { transitionTrip } from "@/services/trips.service";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

const EVENT_SUCCESS_MESSAGE: Record<TripEventType, string> = {
  assigned: "Trip assigned",
  started: "Trip started",
  arrived_stop: "Arrival recorded",
  completed: "Trip completed",
  cancelled: "Trip cancelled",
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function DriverTripsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canSelf = can("trips:self");

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.driverTrips(organisationId)
      : ["driver-trips", "none"],
    queryFn: () => listMyDriverTrips(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const trips = useMemo(() => {
    const data = tripsQuery.data ?? [];
    return [...data]
      .filter((trip) => {
        if (trip.status === "assigned" || trip.status === "in_progress") {
          return true;
        }
        if (trip.status === "completed" && isToday(trip.planned_start)) {
          return true;
        }
        return false;
      })
      .sort((a, b) => a.planned_start.localeCompare(b.planned_start));
  }, [tripsQuery.data]);

  const tripIds = useMemo(() => trips.map((t) => t.id), [trips]);

  const passengersQuery = useQuery({
    queryKey: organisationId
      ? ["driver-trip-passengers", organisationId, ...tripIds]
      : ["driver-trip-passengers", "none"],
    queryFn: () => listPassengersForTrips(organisationId!, tripIds),
    enabled: Boolean(organisationId) && canSelf && tripIds.length > 0,
  });

  const passengersByTrip = useMemo(() => {
    const map = new Map<string, PassengerWithNav[]>();
    for (const p of (passengersQuery.data ?? []) as PassengerWithNav[]) {
      const list = map.get(p.trip_id) ?? [];
      list.push(p);
      map.set(p.trip_id, list);
    }
    return map;
  }, [passengersQuery.data]);

  const transitionMutation = useMutation({
    mutationFn: ({ tripId, event }: { tripId: string; event: TripEventType }) =>
      transitionTrip(tripId, event),
    onSuccess: async (_data, variables) => {
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.driverTrips(organisationId),
        });
      }
      toast.success(EVENT_SUCCESS_MESSAGE[variables.event]);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!canSelf) {
    return (
      <div>
        <PageHeader title="My trips" description="Trips assigned to you." />
        <EmptyState
          title="Driver access required"
          description="Ask your dispatcher for a driver assignment to see trips here."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="My trips" description="Trips assigned to you." />
        <EmptyState
          title="No organisation"
          description="You are not an active member of any organisation yet."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Today’s trips"
        description="Start, navigate to pickups, and complete your roster."
      />

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : trips.length === 0 ? (
        <EmptyState
          title="No trips today"
          description="You have no assigned or in-progress trips right now."
        />
      ) : (
        <div className="space-y-4">
          {trips.map((trip) => {
            const routeName = trip.routes?.name ?? "Trip";
            const pending =
              transitionMutation.isPending &&
              transitionMutation.variables?.tripId === trip.id;
            const passengers = passengersByTrip.get(trip.id) ?? [];
            const firstPickup = passengers[0]
              ? pickupNavTarget(passengers[0])
              : { label: routeName, mapsQuery: routeName };

            return (
              <Card key={trip.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{routeName}</CardTitle>
                    <StatusBadge status={trip.status} />
                  </div>
                  <CardDescription>
                    Planned start: {formatDateTime(trip.planned_start)}
                    {passengers.length
                      ? ` · ${passengers.length} passenger${passengers.length === 1 ? "" : "s"}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {passengers.length ? (
                    <ul className="space-y-2 text-sm">
                      {passengers.map((p) => {
                        const nav = pickupNavTarget(p);
                        return (
                          <li
                            key={p.id}
                            className="rounded-lg border px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">
                                  {p.employees?.full_name ?? "Employee"}
                                </p>
                                <p className="text-muted-foreground">
                                  {p.employees?.companies?.name ?? "—"}
                                  {" · "}
                                  {p.direction === "to_work"
                                    ? "To work"
                                    : "From work"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Pickup: {nav.label}
                                  {p.employees?.phone
                                    ? ` · ${p.employees.phone}`
                                    : ""}
                                </p>
                              </div>
                              <StatusBadge status={p.status} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No booked passengers yet.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {canTransition(trip.status, "started") ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          transitionMutation.mutate({
                            tripId: trip.id,
                            event: "started",
                          })
                        }
                      >
                        Start trip
                      </Button>
                    ) : null}
                    {canTransition(trip.status, "arrived_stop") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          transitionMutation.mutate({
                            tripId: trip.id,
                            event: "arrived_stop",
                          })
                        }
                      >
                        Arrive
                      </Button>
                    ) : null}
                    {canTransition(trip.status, "completed") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          transitionMutation.mutate({
                            tripId: trip.id,
                            event: "completed",
                          })
                        }
                      >
                        Complete
                      </Button>
                    ) : null}
                    <a
                      href={mapsDirectionsUrl(firstPickup.mapsQuery)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      <Navigation className="size-3.5" />
                      Navigate
                    </a>
                    <Button size="sm" variant="secondary" render={<Link href="/driver/scan" />}>
                      Scan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
