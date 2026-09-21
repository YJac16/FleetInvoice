"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { staffCompanyOptions } from "@/features/driver-portal/lib/trip-labels";
import {
  STAFF_TRANSPORT_COMPANIES,
  type StaffTransportCompany,
} from "@/lib/constants";
import { updateStaffTrip } from "@/services/staff-trips.service";
import type { StaffTrip } from "@/types";
import { getErrorMessage } from "@/utils/errors";

const schema = z.object({
  date: z.string().min(1, "Date required"),
  time: z.string().min(1, "Time required"),
  staffCompany: z.enum(STAFF_TRANSPORT_COMPANIES),
  areaText: z.string().min(1, "Area required"),
  paxCount: z.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

type EditWaybillDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: StaffTrip | null;
  onSaved: () => void;
};

export function EditWaybillDialog({
  open,
  onOpenChange,
  trip,
  onSaved,
}: EditWaybillDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: "",
      time: "08:00",
      staffCompany: "lewis_compliance",
      areaText: "",
      paxCount: 1,
    },
  });

  useEffect(() => {
    if (!open || !trip) return;
    const local = dayjs(trip.planned_start);
    form.reset({
      date: local.format("YYYY-MM-DD"),
      time: local.format("HH:mm"),
      staffCompany: (trip.staff_company ??
        "lewis_compliance") as StaffTransportCompany,
      areaText: trip.area_text ?? "",
      paxCount: trip.pax_count ?? 0,
    });
  }, [open, trip, form]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!trip) throw new Error("No trip selected");
      const plannedStart = `${values.date}T${values.time}:00+02:00`;
      return updateStaffTrip(trip.id, {
        plannedStart,
        staffCompany: values.staffCompany,
        areaText: values.areaText,
        paxCount: values.paxCount,
      });
    },
    onSuccess: () => {
      toast.success("Waybill updated — invoice line synced");
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit completed waybill"
      description="Updates the trip and the linked draft invoice line (rate card must exist)."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saveMutation.isPending || !trip}
            onClick={form.handleSubmit((values) => saveMutation.mutate(values))}
          >
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-date">Date</Label>
            <Input id="edit-date" type="date" {...form.register("date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-time">Time</Label>
            <Input id="edit-time" type="time" {...form.register("time")} />
          </div>
        </div>

        <SelectField
          control={form.control}
          name="staffCompany"
          label="Company"
          options={staffCompanyOptions()}
        />

        <div className="space-y-1.5">
          <Label htmlFor="edit-area">Area</Label>
          <Input id="edit-area" {...form.register("areaText")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-pax">Pax</Label>
          <Input
            id="edit-pax"
            type="number"
            min={0}
            {...form.register("paxCount", { valueAsNumber: true })}
          />
        </div>
      </form>
    </FormDialog>
  );
}
