"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listMyEmployeeTrips } from "@/services/attendance.service";
import {
  cancelTripSeat,
  listMyTripPassengers,
  requestTripSeat,
} from "@/services/trip-passengers.service";
import type { TripPassengerDirection } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

export function EmployeeBookPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canSelf = can("trips:self") || can("attendance:self");
  const [direction, setDirection] = useState<TripPassengerDirection>("to_work");

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.employeeTrips(organisationId)
      : ["employee-trips", "none"],
    queryFn: () => listMyEmployeeTrips(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const seatsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.myTripPassengers(organisationId)
      : ["my-trip-passengers", "none"],
    queryFn: () => listMyTripPassengers(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const seats = seatsQuery.data ?? [];

  const seatByTrip = useMemo(() => {
    const map = new Map<string, (typeof seats)[number]>();
    for (const seat of seats) {
      map.set(seat.trip_id, seat);
    }
    return map;
  }, [seats]);

  const requestMutation = useMutation({
    mutationFn: (tripId: string) =>
      requestTripSeat({
        organisationId: organisationId!,
        tripId,
        direction,
      }),
    onSuccess: async (seat) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.myTripPassengers(organisationId!),
      });
      toast.success(
        seat.status === "confirmed"
          ? "Seat confirmed"
          : "Seat requested — awaiting capacity"
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (tripId: string) =>
      cancelTripSeat({ organisationId: organisationId!, tripId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.myTripPassengers(organisationId!),
      });
      toast.success("Booking cancelled");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!canSelf) {
    return (
      <div>
        <PageHeader title="Book" description="Request a seat on a trip." />
        <EmptyState
          title="Employee access required"
          description="Ask an admin to link your profile to an employee record."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="Book" description="Request a seat on a trip." />
        <EmptyState
          title="No organisation"
          description="You are not an active member of any organisation yet."
        />
      </div>
    );
  }

  const trips = tripsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Book a seat"
        description="Choose a scheduled trip for transport to work or at the end of your shift."
      />

      <div className="flex gap-2">
        {(
          [
            ["to_work", "To work"],
            ["from_work", "From work"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDirection(value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              direction === value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tripsQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : trips.length === 0 ? (
        <EmptyState
          title="No upcoming trips"
          description="When trips are planned for your company, they will appear here."
        />
      ) : (
        <div className="space-y-3">
          {trips.map((trip) => {
            const seat = seatByTrip.get(trip.id);
            const pending =
              (requestMutation.isPending &&
                requestMutation.variables === trip.id) ||
              (cancelMutation.isPending &&
                cancelMutation.variables === trip.id);

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
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  {seat && seat.status !== "cancelled" ? (
                    <>
                      <StatusBadge status={seat.status} />
                      <span className="text-xs text-muted-foreground">
                        {seat.direction === "to_work"
                          ? "To work"
                          : "From work"}
                      </span>
                      {seat.status !== "boarded" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => cancelMutation.mutate(trip.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => requestMutation.mutate(trip.id)}
                    >
                      {pending ? "Booking…" : "Request seat"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
