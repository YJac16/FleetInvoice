"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatOdometerKm } from "@/features/vehicles/schemas/vehicle";
import {
  createVehicleUpdate,
  listVehicleUpdates,
  softDeleteVehicleUpdate,
} from "@/services/vehicle-updates.service";
import type { Vehicle } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

type VehicleUpdatesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  vehicle: Vehicle | null;
  canManage: boolean;
};

export function VehicleUpdatesDialog({
  open,
  onOpenChange,
  organisationId,
  vehicle,
  canManage,
}: VehicleUpdatesDialogProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [odometerKm, setOdometerKm] = useState("");

  const updatesQuery = useQuery({
    queryKey:
      vehicle && organisationId
        ? queryKeys.vehicleUpdates(organisationId, vehicle.id)
        : ["vehicle-updates", "none"],
    queryFn: () => listVehicleUpdates(organisationId, vehicle!.id),
    enabled: open && Boolean(vehicle),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!vehicle || !note.trim()) throw new Error("Note is required");
      const km = odometerKm.trim() ? Number(odometerKm) : null;
      if (odometerKm.trim() && (!Number.isFinite(km) || km! < 0)) {
        throw new Error("Km must be a non-negative number");
      }
      return createVehicleUpdate({
        organisationId,
        vehicleId: vehicle.id,
        note: note.trim(),
        odometerKm: km,
      });
    },
    onSuccess: async () => {
      setNote("");
      setOdometerKm("");
      toast.success("Update recorded");
      if (vehicle) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.vehicleUpdates(organisationId, vehicle.id),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.vehicles(organisationId),
        });
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteVehicleUpdate(id),
    onSuccess: async () => {
      toast.success("Update archived");
      if (vehicle) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.vehicleUpdates(organisationId, vehicle.id),
        });
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        vehicle
          ? `Updates — ${vehicle.registration_number || vehicle.name}`
          : "Vehicle updates"
      }
      description="Record service notes, km readings, and other changes for this vehicle."
    >
      {!vehicle ? null : updatesQuery.isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          {(updatesQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No updates yet"
              description="Record km readings, services, or other notes here."
            />
          ) : (
            <ul className="space-y-3">
              {(updatesQuery.data ?? []).map((update) => (
                <li
                  key={update.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm">{update.note}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(update.recorded_at)}
                      {update.odometer_km != null
                        ? ` · ${formatOdometerKm(update.odometer_km)}`
                        : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(update.id)}
                    >
                      Archive
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canManage ? (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Tyres replaced, licence renewed, accident, …"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Odometer km (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={odometerKm}
                  onChange={(e) => setOdometerKm(e.target.value)}
                  placeholder="Current km"
                />
              </div>
              <Button
                className="w-full"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Saving…" : "Add update"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </FormDialog>
  );
}
