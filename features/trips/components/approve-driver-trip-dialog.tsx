"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatVehicleOptionLabel } from "@/features/trips/lib/staff-waybill-form";
import {
  approveDriverTrip,
  suggestDriverTripVehicle,
} from "@/services/driver-submitted-trips.service";
import { listVehicles } from "@/services/vehicles.service";
import type { StaffTrip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

type ApproveDriverTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  trip: StaffTrip | null;
  onApproved: () => void;
};

export function ApproveDriverTripDialog({
  open,
  onOpenChange,
  organisationId,
  trip,
  onApproved,
}: ApproveDriverTripDialogProps) {
  const [vehicleId, setVehicleId] = useState("");

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(organisationId),
    queryFn: () => listVehicles(organisationId),
    enabled: open,
  });

  const suggestQuery = useQuery({
    queryKey: trip ? [...queryKeys.trips(organisationId), "suggest-vehicle", trip.id] : [],
    queryFn: () => suggestDriverTripVehicle(trip!.id),
    enabled: open && Boolean(trip?.id),
  });

  useEffect(() => {
    if (!open || !trip) {
      setVehicleId("");
      return;
    }
    const suggested = suggestQuery.data;
    if (suggested) {
      setVehicleId(suggested);
    }
  }, [open, trip, suggestQuery.data]);

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!trip) throw new Error("No trip");
      if (!vehicleId) throw new Error("Select a vehicle");
      return approveDriverTrip(trip.id, vehicleId);
    },
    onSuccess: () => {
      toast.success("Trip approved");
      onOpenChange(false);
      onApproved();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const driverName =
    trip?.trip_assignments?.[0]?.drivers?.full_name ?? "Driver";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Approve driver trip"
      description={`Confirm or choose the vehicle for ${driverName}. Approval requires a vehicle.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!vehicleId || approveMutation.isPending}
            onClick={() => approveMutation.mutate()}
          >
            {approveMutation.isPending ? "Approving…" : "Approve trip"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {trip ? (
          <p className="text-sm text-muted-foreground">
            {trip.area_text} · {trip.companies?.name ?? "Company"}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label>Vehicle</Label>
          <Select value={vehicleId} onValueChange={(v) => setVehicleId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="Select vehicle" />
            </SelectTrigger>
            <SelectContent>
              {(vehiclesQuery.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {formatVehicleOptionLabel(v.registration_number, v.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suggestQuery.data && vehicleId === suggestQuery.data ? (
            <p className="text-xs text-muted-foreground">
              Pre-filled from this driver&apos;s current vehicle assignment.
            </p>
          ) : null}
        </div>
      </div>
    </FormDialog>
  );
}
