"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { listDrivers } from "@/services/drivers.service";
import { assignTrip } from "@/services/trip-assignments.service";
import { listVehicles } from "@/services/vehicles.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const NO_VEHICLE = "none";

type AssignTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  tripId: string | null;
  onAssigned: () => void;
};

export function AssignTripDialog({
  open,
  onOpenChange,
  organisationId,
  tripId,
  onAssigned,
}: AssignTripDialogProps) {
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState(NO_VEHICLE);

  useEffect(() => {
    if (!open) {
      setDriverId("");
      setVehicleId(NO_VEHICLE);
    }
  }, [open]);

  const driversQuery = useQuery({
    queryKey: queryKeys.drivers(organisationId),
    queryFn: () => listDrivers(organisationId),
    enabled: open,
  });

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(organisationId),
    queryFn: () => listVehicles(organisationId),
    enabled: open,
  });

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!tripId) throw new Error("No trip selected");
      if (!driverId) throw new Error("Select a driver");
      return assignTrip(
        tripId,
        driverId,
        vehicleId === NO_VEHICLE ? null : vehicleId
      );
    },
    onSuccess: () => {
      toast.success("Trip assigned");
      onOpenChange(false);
      onAssigned();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign trip"
      description="Assign a driver (and optionally a vehicle) to this trip."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Driver</Label>
          <Select
            value={driverId}
            onValueChange={(value) => setDriverId(value ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a driver" />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Vehicle (optional)</Label>
          <Select
            value={vehicleId}
            onValueChange={(value) => setVehicleId(value ?? NO_VEHICLE)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_VEHICLE}>No vehicle</SelectItem>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={!driverId || assignMutation.isPending}
          onClick={() => assignMutation.mutate()}
        >
          {assignMutation.isPending ? "Assigning…" : "Assign trip"}
        </Button>
      </div>
    </FormDialog>
  );
}
