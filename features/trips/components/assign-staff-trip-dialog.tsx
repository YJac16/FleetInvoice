"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/form-fields";
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
import { staffCompanyOptions } from "@/features/driver-portal/lib/trip-labels";
import {
  STAFF_TRANSPORT_COMPANIES,
  type StaffTransportCompany,
} from "@/lib/constants";
import { listDrivers } from "@/services/drivers.service";
import { assignStaffTrip } from "@/services/staff-trips.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  driverId: z.string().min(1, "Select a driver"),
  date: z.string().min(1, "Date required"),
  time: z.string().min(1, "Time required"),
  staffCompany: z.enum(STAFF_TRANSPORT_COMPANIES),
  areaText: z.string().min(1, "Area required"),
  paxCount: z.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

type AssignStaffTripDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  onAssigned: () => void;
};

export function AssignStaffTripDialog({
  open,
  onOpenChange,
  organisationId,
  onAssigned,
}: AssignStaffTripDialogProps) {
  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      driverId: "",
      date: today,
      time: "08:00",
      staffCompany: "lewis_compliance",
      areaText: "",
      paxCount: 1,
    },
  });

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const driversQuery = useQuery({
    queryKey: queryKeys.drivers(organisationId),
    queryFn: () => listDrivers(organisationId),
    enabled: open,
  });

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const companyOptions = staffCompanyOptions();

  const assignMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const plannedStart = `${values.date}T${values.time}:00+02:00`;
      return assignStaffTrip(
        organisationId,
        values.driverId,
        plannedStart,
        values.staffCompany,
        values.areaText,
        values.paxCount
      );
    },
    onSuccess: () => {
      toast.success("Staff trip assigned");
      onOpenChange(false);
      onAssigned();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign staff trip"
      description="Create a waybill trip for a driver (company, area, pax)."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={assignMutation.isPending}
            onClick={form.handleSubmit((values) => assignMutation.mutate(values))}
          >
            {assignMutation.isPending ? "Assigning…" : "Assign trip"}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => assignMutation.mutate(v))}>
        <div className="space-y-1.5">
          <Label>Driver</Label>
          <Select
            value={form.watch("driverId")}
            onValueChange={(v) => form.setValue("driverId", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select driver" />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.driverId ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.driverId.message}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="trip-date">Date</Label>
            <Input id="trip-date" type="date" {...form.register("date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trip-time">Time</Label>
            <Input id="trip-time" type="time" {...form.register("time")} />
          </div>
        </div>

        <SelectField
          control={form.control}
          name="staffCompany"
          label="Company"
          options={companyOptions}
        />

        <div className="space-y-1.5">
          <Label htmlFor="area">Area</Label>
          <Input
            id="area"
            placeholder="e.g. Cape Town CBD → Bellville"
            {...form.register("areaText")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pax">Pax</Label>
          <Input
            id="pax"
            type="number"
            min={0}
            {...form.register("paxCount", { valueAsNumber: true })}
          />
        </div>
      </form>
    </FormDialog>
  );
}
