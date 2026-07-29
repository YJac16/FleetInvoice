"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
import type { Trip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

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

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

type ConfirmTarget = {
  tripId: string;
  event: "arrived_stop" | "completed";
  title: string;
  description: string;
  confirmLabel: string;
};

function PassengerList({
  passengers,
  compact,
}: {
  passengers: PassengerWithNav[];
  compact?: boolean;
}) {
  if (!passengers.length) {
    return (
      <p className="text-sm text-muted-foreground">No booked passengers yet.</p>
    );
  }

  const boarded = passengers.filter((p) => p.status === "boarded").length;

  return (
    <div className="space-y-2">
      {!compact ? (
        <p className="text-sm text-muted-foreground">
          {boarded} of {passengers.length} boarded
        </p>
      ) : null}
      <ul className="space-y-2 text-sm">
        {passengers.map((p) => {
          const nav = pickupNavTarget(p);
          const phone = p.employees?.phone?.trim();
          return (
            <li
              key={p.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                p.status === "boarded" && "bg-muted/40"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.employees?.full_name ?? "Employee"}
                  </p>
                  <p className="text-muted-foreground">
                    {p.employees?.companies?.name ?? "—"}
                    {" · "}
                    {p.direction === "to_work" ? "To work" : "From work"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pickup: {nav.label}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {phone ? (
                  <Button
                    size="sm"
                    variant="outline"
                    render={<a href={phoneHref(phone)} />}
                  >
                    <Phone className="size-3.5" />
                    Call
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <a
                      href={mapsDirectionsUrl(nav.mapsQuery)}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <Navigation className="size-3.5" />
                  Navigate
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DriverTripsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canSelf = can("trips:self");
  const canPublishGps = can("gps:publish");
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);

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
      .sort((a, b) => {
        const rank = (t: Trip) =>
          t.status === "in_progress" ? 0 : t.status === "assigned" ? 1 : 2;
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        return a.planned_start.localeCompare(b.planned_start);
      });
  }, [tripsQuery.data]);

  const focusedTrip = trips.find(
    (t) => t.status === "in_progress" || t.status === "assigned"
  );
  const otherTrips = trips.filter((t) => t.id !== focusedTrip?.id);

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
      setConfirmTarget(null);
      if (variables.event === "started" && canPublishGps) {
        setShowLocationPrompt(true);
      }
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

  function renderActions(trip: Trip, focused: boolean) {
    const pending =
      transitionMutation.isPending &&
      transitionMutation.variables?.tripId === trip.id;
    const passengers = passengersByTrip.get(trip.id) ?? [];
    const firstPickup = passengers[0]
      ? pickupNavTarget(passengers[0])
      : {
          label: trip.routes?.name ?? "Trip",
          mapsQuery: trip.routes?.name ?? "Trip",
        };
    const size = focused ? "default" : "sm";
    const stack = focused ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap" : "flex flex-wrap items-center gap-2";

    return (
      <div className={stack}>
        {canTransition(trip.status, "started") ? (
          <Button
            size={size}
            className={focused ? "w-full sm:w-auto" : undefined}
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
        {trip.status === "in_progress" ? (
          <Button
            size={size}
            className={focused ? "w-full sm:w-auto" : undefined}
            variant={focused ? "default" : "secondary"}
            render={<Link href="/driver/scan" />}
          >
            Scan boarding
          </Button>
        ) : null}
        {canTransition(trip.status, "arrived_stop") ? (
          <Button
            size={size}
            variant="outline"
            className={focused ? "w-full sm:w-auto" : undefined}
            disabled={pending}
            onClick={() =>
              setConfirmTarget({
                tripId: trip.id,
                event: "arrived_stop",
                title: "Mark arrived?",
                description: "Record that you have arrived at the stop.",
                confirmLabel: "Arrive",
              })
            }
          >
            Arrive
          </Button>
        ) : null}
        {canTransition(trip.status, "completed") ? (
          <Button
            size={size}
            variant="outline"
            className={focused ? "w-full sm:w-auto" : undefined}
            disabled={pending}
            onClick={() =>
              setConfirmTarget({
                tripId: trip.id,
                event: "completed",
                title: "Complete trip?",
                description: "Mark this trip as completed. This cannot be undone from here.",
                confirmLabel: "Complete",
              })
            }
          >
            Complete
          </Button>
        ) : null}
        <Button
          size={size}
          variant="ghost"
          className={focused ? "w-full sm:w-auto" : undefined}
          render={
            <a
              href={mapsDirectionsUrl(firstPickup.mapsQuery)}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <Navigation className="size-3.5" />
          Navigate
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Today’s trips"
        description="Start, navigate to pickups, and complete your roster."
      />

      {showLocationPrompt && canPublishGps ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p>
              Share your location so dispatch can see you on the live board.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" render={<Link href="/driver/location" />}>
              Share location
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowLocationPrompt(false)}
            >
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : trips.length === 0 ? (
        <EmptyState
          title="No trips today"
          description="You have no assigned or in-progress trips right now."
        />
      ) : (
        <div className="space-y-4">
          {focusedTrip ? (
            <Card className="border-foreground/15 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">
                    {focusedTrip.routes?.name ?? "Trip"}
                  </CardTitle>
                  <StatusBadge status={focusedTrip.status} />
                </div>
                <CardDescription>
                  Planned start: {formatDateTime(focusedTrip.planned_start)}
                  {(passengersByTrip.get(focusedTrip.id) ?? []).length
                    ? ` · ${(passengersByTrip.get(focusedTrip.id) ?? []).length} passenger${
                        (passengersByTrip.get(focusedTrip.id) ?? []).length === 1
                          ? ""
                          : "s"
                      }`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <PassengerList
                  passengers={passengersByTrip.get(focusedTrip.id) ?? []}
                />
                {renderActions(focusedTrip, true)}
              </CardContent>
            </Card>
          ) : null}

          {otherTrips.map((trip) => {
            const passengers = passengersByTrip.get(trip.id) ?? [];
            return (
              <Card key={trip.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {trip.routes?.name ?? "Trip"}
                    </CardTitle>
                    <StatusBadge status={trip.status} />
                  </div>
                  <CardDescription>
                    {formatDateTime(trip.planned_start)}
                    {passengers.length
                      ? ` · ${passengers.length} passenger${passengers.length === 1 ? "" : "s"}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <PassengerList passengers={passengers} compact />
                  {renderActions(trip, false)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        title={confirmTarget?.title ?? ""}
        description={confirmTarget?.description ?? ""}
        confirmLabel={confirmTarget?.confirmLabel}
        loading={transitionMutation.isPending}
        onConfirm={() => {
          if (!confirmTarget) return;
          transitionMutation.mutate({
            tripId: confirmTarget.tripId,
            event: confirmTarget.event,
          });
        }}
      />
    </div>
  );
}
