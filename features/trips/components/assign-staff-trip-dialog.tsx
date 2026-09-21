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
import { STAFF_TRANSPORT_COMPANIES } from "@/lib/constants";
import { listDrivers } from "@/services/drivers.service";
import {
  assignStaffTrip,
  backfillStaffWaybill,
} from "@/services/staff-trips.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";

const schema = z.object({
  driverId: z.string().min(1, "Select a driver"),
  date: z.string().min(1, "Date required"),
  time: z.string().min(1, "Time required"),
  staffCompany: z.enum(STAFF_TRANSPORT_COMPANIES),
  areaText: z.string().min(1, "Area required"),
  paxCount: z.number().int().min(0),
  openingKm: z.string().optional(),
  closingKm: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type WaybillMode = "send" | "backfill";

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
  const [mode, setMode] = useState<WaybillMode>("send");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      driverId: "",
      date: today,
      time: "08:00",
      staffCompany: "lewis_compliance",
      areaText: "",
      paxCount: 1,
      openingKm: "",
      closingKm: "",
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
      setMode("send");
    }
  }, [open, form]);

  const driversQuery = useQuery({
    queryKey: queryKeys.drivers(organisationId),
    queryFn: () => listDrivers(organisationId),
    enabled: open,
  });

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const companyOptions = staffCompanyOptions();

  const submitMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const plannedStart = `${values.date}T${values.time}:00+02:00`;
      if (mode === "send") {
        return assignStaffTrip(
          organisationId,
          values.driverId,
          plannedStart,
          values.staffCompany,
          values.areaText,
          values.paxCount
        );
      }
      const opening =
        values.openingKm?.trim() ? Number.parseFloat(values.openingKm) : null;
      const closing =
        values.closingKm?.trim() ? Number.parseFloat(values.closingKm) : null;
      return backfillStaffWaybill(
        organisationId,
        values.driverId,
        plannedStart,
        values.staffCompany,
        values.areaText,
        values.paxCount,
        opening,
        closing
      );
    },
    onSuccess: () => {
      toast.success(
        mode === "send"
          ? "Waybill sent to driver"
          : "Waybill backfilled — draft invoice line added"
      );
      onOpenChange(false);
      onAssigned();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const primaryLabel =
    mode === "send"
      ? submitMutation.isPending
        ? "Sending…"
        : "Send to driver"
      : submitMutation.isPending
        ? "Saving…"
        : "Backfill completed";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create waybill"
      description={
        mode === "send"
          ? "Manual waybill for a driver — they start and complete it in the portal."
          : "Record a completed waybill without driver portal (adds a draft invoice line)."
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitMutation.isPending}
            onClick={form.handleSubmit((values) => submitMutation.mutate(values))}
          >
            {primaryLabel}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1">
        {(
          [
            ["send", "Send to driver"],
            ["backfill", "Backfill completed"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((v) => submitMutation.mutate(v))}
      >
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

        {mode === "backfill" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="opening-km">Opening km (optional)</Label>
              <Input id="opening-km" inputMode="decimal" {...form.register("openingKm")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closing-km">Closing km (optional)</Label>
              <Input id="closing-km" inputMode="decimal" {...form.register("closingKm")} />
            </div>
          </div>
        ) : null}
      </form>
    </FormDialog>
  );
}
