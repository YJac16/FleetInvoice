"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { LocationInput } from "@/features/locations/components/location-input";
import { Button } from "@/components/ui/button";
import { listServiceLocations } from "@/services/locations.service";
import { updateTripServiceLocations } from "@/services/trips.service";
import { normalizeAreaValue } from "@/features/locations/lib/location-match";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

export function TripLocationsDialog({
  open,
  onOpenChange,
  organisationId,
  tripId,
  tripLabel,
  initialValue,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  tripId: string | null;
  tripLabel?: string | null;
  initialValue?: string | null;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(initialValue ?? "");

  useEffect(() => {
    if (open) setValue(initialValue ?? "");
  }, [open, initialValue]);

  const locationsQuery = useQuery({
    queryKey: ["service-locations", organisationId],
    queryFn: () => listServiceLocations(organisationId),
    enabled: open && Boolean(organisationId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tripId) throw new Error("Trip not selected");
      const locations = locationsQuery.data ?? [];
      const { value: normalized } = normalizeAreaValue(value, locations);
      await updateTripServiceLocations(
        tripId,
        normalized.trim() ? normalized : null
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.trips(organisationId),
      });
      toast.success("Trip locations saved");
      onSaved?.();
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Trip locations"
      description={
        tripLabel
          ? `Set AREA places for ${tripLabel}. Used on invoice print.`
          : "Set AREA places for this trip. Used on invoice print."
      }
    >
      <div className="space-y-4">
        <LocationInput
          organisationId={organisationId}
          value={value}
          onChange={setValue}
          description="Pick Cape Town suburbs and townships. Use multiple for multi-drop runs."
        />
        <Button
          className="w-full"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving…" : "Save locations"}
        </Button>
      </div>
    </FormDialog>
  );
}
