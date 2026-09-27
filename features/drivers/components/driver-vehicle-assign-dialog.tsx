"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import {
  assignVehicleToDriver,
  listOpenDriverVehicleAssignments,
  unassignVehicleFromDriver,
} from "@/services/driver-vehicle-assignment.service";
import { listVehicles } from "@/services/vehicles.service";
import type { Driver } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  driver: Driver | null;
};

export function DriverVehicleAssignDialog({
  open,
  onOpenChange,
  organisationId,
  driver,
}: Props) {
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState<string>("");

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(organisationId),
    queryFn: () => listVehicles(organisationId),
    enabled: open && Boolean(organisationId),
  });

  const assignmentsQuery = useQuery({
    queryKey: queryKeys.driverVehicleAssignments(organisationId),
    queryFn: () => listOpenDriverVehicleAssignments(organisationId),
    enabled: open && Boolean(organisationId),
  });

  const currentVehicleId = assignmentsQuery.data?.find(
    (a) => a.driver_id === driver?.id
  )?.vehicle_id;

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!driver || !vehicleId) return;
      await assignVehicleToDriver(driver.id, vehicleId);
    },
    onSuccess: async () => {
      toast.success("Vehicle assigned");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.driverVehicleAssignments(organisationId),
      });
      onOpenChange(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      if (!driver) return;
      await unassignVehicleFromDriver(driver.id);
    },
    onSuccess: async () => {
      toast.success("Vehicle unassigned");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.driverVehicleAssignments(organisationId),
      });
      onOpenChange(false);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const vehicles = vehiclesQuery.data ?? [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign vehicle"
      description={
        driver
          ? `Standing assignment for ${driver.full_name} (one vehicle at a time).`
          : undefined
      }
    >
      <div className="space-y-4">
        {currentVehicleId ? (
          <p className="text-sm text-muted-foreground">
            Currently:{" "}
            {formatVehicleLabel(
              vehicles.find((v) => v.id === currentVehicleId) ?? {
                id: currentVehicleId,
              }
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No vehicle assigned.</p>
        )}

        <Select
          value={vehicleId}
          onValueChange={(value) => setVehicleId(value ?? "")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select vehicle" />
          </SelectTrigger>
          <SelectContent>
            {vehicles
              .filter((v) => v.status === "active")
              .map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {formatVehicleLabel(v)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={!vehicleId || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
          >
            {assignMutation.isPending ? "Saving…" : "Assign / change"}
          </Button>
          {currentVehicleId ? (
            <Button
              variant="outline"
              className="flex-1"
              disabled={unassignMutation.isPending}
              onClick={() => unassignMutation.mutate()}
            >
              Unassign
            </Button>
          ) : null}
        </div>
      </div>
    </FormDialog>
  );
}
