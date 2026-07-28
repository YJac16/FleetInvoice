"use client";

import { useQuery } from "@tanstack/react-query";

import { FormDialog } from "@/components/forms/form-dialog";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { listTripPassengers } from "@/services/trip-passengers.service";
import { queryKeys } from "@/utils/query";

type TripPassengersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  tripId: string | null;
  tripLabel?: string;
};

export function TripPassengersDialog({
  open,
  onOpenChange,
  organisationId,
  tripId,
  tripLabel,
}: TripPassengersDialogProps) {
  const passengersQuery = useQuery({
    queryKey:
      tripId != null
        ? queryKeys.tripPassengers(organisationId, tripId)
        : ["trip-passengers", "none"],
    queryFn: () => listTripPassengers(organisationId, tripId!),
    enabled: open && Boolean(tripId),
  });

  const passengers = passengersQuery.data ?? [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Passengers"
      description={
        tripLabel
          ? `Seat bookings for ${tripLabel}`
          : "Confirmed and requested seats on this trip."
      }
    >
      {passengersQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : passengers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No seat bookings on this trip yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {passengers.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {p.employees?.full_name ?? "Employee"}
                </p>
                <p className="text-muted-foreground">
                  {p.employees?.companies?.name ?? "—"}
                  {" · "}
                  {p.direction === "to_work" ? "To work" : "From work"}
                </p>
              </div>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </FormDialog>
  );
}
