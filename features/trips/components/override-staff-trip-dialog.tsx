"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isVerifiedDestination } from "@/features/areas/lib/destination";
import { listAreas } from "@/services/areas.service";
import { overrideStaffTrip } from "@/services/staff-trips.service";
import type { StaffTrip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

const schema = z.object({
  date: z.string().min(1),
  time: z.string().min(1),
  areaId: z.string().min(1, "Select an area"),
  openingKm: z.string().optional(),
  closingKm: z.string().optional(),
  paxCount: z.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

type OverrideStaffTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  trip: StaffTrip | null;
  onSaved: () => void;
};

export function OverrideStaffTripDialog({
  open,
  onOpenChange,
  organisationId,
  trip,
  onSaved,
}: OverrideStaffTripDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: "",
      time: "08:00",
      areaId: "",
      openingKm: "",
      closingKm: "",
      paxCount: 1,
    },
  });

  const areasQuery = useQuery({
    queryKey: queryKeys.areas(organisationId),
    queryFn: () => listAreas(organisationId),
    enabled: open,
  });
  const areas = useMemo(
    () => (areasQuery.data ?? []).filter(isVerifiedDestination),
    [areasQuery.data]
  );

  useEffect(() => {
    if (!open || !trip) return;
    const local = new Date(trip.planned_start);
    const date = local.toISOString().slice(0, 10);
    const time = `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
    form.reset({
      date,
      time,
      areaId: trip.area_id ?? "",
      openingKm: trip.opening_km != null ? String(trip.opening_km) : "",
      closingKm: trip.closing_km != null ? String(trip.closing_km) : "",
      paxCount: trip.pax_count ?? 0,
    });
  }, [open, trip, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!trip) throw new Error("No trip");
      const plannedStart = `${values.date}T${values.time}:00+02:00`;
      const opening = values.openingKm?.trim()
        ? Number.parseFloat(values.openingKm)
        : null;
      const closing = values.closingKm?.trim()
        ? Number.parseFloat(values.closingKm)
        : null;
      return overrideStaffTrip(trip.id, {
        plannedStart,
        areaId: values.areaId,
        openingKm: opening,
        closingKm: closing,
        paxCount: values.paxCount,
      });
    },
    onSuccess: () => {
      toast.success("Trip updated");
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Correct staff trip"
      description="Fix km, area, or time after the driver captured the waybill. Invoice lines update if the trip is completed."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !trip}
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="override-date">Date</Label>
            <Input id="override-date" type="date" {...form.register("date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-time">Time</Label>
            <Input id="override-time" type="time" {...form.register("time")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Area</Label>
          <Select
            value={form.watch("areaId")}
            onValueChange={(v) => form.setValue("areaId", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select area" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="override-open">Opening km</Label>
            <Input id="override-open" type="number" step={0.1} {...form.register("openingKm")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-close">Closing km</Label>
            <Input id="override-close" type="number" step={0.1} {...form.register("closingKm")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="override-pax">Pax</Label>
          <Input
            id="override-pax"
            type="number"
            min={0}
            {...form.register("paxCount", { valueAsNumber: true })}
          />
        </div>
      </form>
    </FormDialog>
  );
}
