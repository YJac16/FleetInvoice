"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TripAuditTimeline } from "@/features/trips/components/trip-audit-timeline";
import { formatVehicleOptionLabel } from "@/features/trips/lib/staff-waybill-form";
import { listActiveCompanies } from "@/services/companies.service";
import { updateStaffTrip } from "@/services/staff-trips.service";
import {
  clearTripBillingOverride,
  getTripBillingOverride,
  setTripBillingOverride,
} from "@/services/trip-admin.service";
import { listVehicles } from "@/services/vehicles.service";
import type { StaffTrip } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  date: z.string().min(1, "Date required"),
  time: z.string().min(1, "Time required"),
  companyId: z.string().uuid("Select a company"),
  areaText: z.string().min(1, "Area required"),
  paxCount: z.number().int().min(0),
  totalKm: z.number().min(0).optional(),
  notes: z.string().optional(),
  vehicleId: z.string().uuid().optional().or(z.literal("")),
  editReason: z.string().min(1, "Reason for this edit is required"),
});

type FormValues = z.infer<typeof schema>;

type EditWaybillDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  trip: StaffTrip | null;
  onSaved: () => void;
  variant?: "pending" | "standard";
};

export function EditWaybillDialog({
  open,
  onOpenChange,
  organisationId,
  trip,
  onSaved,
  variant = "standard",
}: EditWaybillDialogProps) {
  const queryClient = useQueryClient();
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: "",
      time: "08:00",
      companyId: "",
      areaText: "",
      paxCount: 1,
      totalKm: undefined,
      notes: "",
      vehicleId: "",
      editReason: "",
    },
  });

  const companiesQuery = useQuery({
    queryKey: queryKeys.companies(organisationId),
    queryFn: () => listActiveCompanies(organisationId),
    enabled: open,
  });

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(organisationId),
    queryFn: () => listVehicles(organisationId),
    enabled: open,
  });

  const overrideQuery = useQuery({
    queryKey: queryKeys.tripBillingOverride(trip?.id ?? ""),
    queryFn: () => getTripBillingOverride(trip!.id),
    enabled: open && Boolean(trip?.id),
  });

  const companyOptions = useMemo(
    () =>
      (companiesQuery.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
      })),
    [companiesQuery.data]
  );

  const assignmentVehicleId = useMemo(() => {
    const ta = trip?.trip_assignments?.[0];
    return ta?.vehicle_id ?? "";
  }, [trip]);

  useEffect(() => {
    if (!open || !trip) return;
    const local = dayjs(trip.planned_start);
    form.reset({
      date: local.format("YYYY-MM-DD"),
      time: local.format("HH:mm"),
      companyId: trip.company_id ?? "",
      areaText: trip.area_text ?? "",
      paxCount: trip.pax_count ?? 0,
      totalKm: trip.total_km != null ? Number(trip.total_km) : undefined,
      notes: trip.notes ?? "",
      vehicleId: assignmentVehicleId,
      editReason: "",
    });
    const existing = overrideQuery.data;
    setOverrideAmount(
      existing?.override_unit_price != null ? String(existing.override_unit_price) : ""
    );
    setOverrideReason(existing?.reason ?? "");
  }, [open, trip, form, assignmentVehicleId, overrideQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!trip) throw new Error("No trip selected");
      const plannedStart = `${values.date}T${values.time}:00+02:00`;
      return updateStaffTrip(trip.id, {
        plannedStart,
        companyId: values.companyId,
        staffCompany: null,
        areaText: values.areaText,
        paxCount: values.paxCount,
        totalKm: values.totalKm,
        notes: values.notes,
        vehicleId: values.vehicleId || undefined,
        editReason: values.editReason,
      });
    },
    onSuccess: () => {
      toast.success("Trip updated");
      if (trip) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tripAudit(trip.id) });
      }
      onOpenChange(false);
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const overrideMutation = useMutation({
    mutationFn: async () => {
      if (!trip) throw new Error("No trip");
      const amount = Number(overrideAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Enter a valid override amount");
      }
      if (!overrideReason.trim()) {
        throw new Error("Override reason is required");
      }
      await setTripBillingOverride(trip.id, amount, overrideReason.trim());
    },
    onSuccess: () => {
      toast.success("Billing override saved — invoice line updated when applicable");
      if (trip) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.tripBillingOverride(trip.id),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.tripAudit(trip.id) });
      }
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const clearOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!trip) throw new Error("No trip");
      if (!overrideReason.trim()) {
        throw new Error("Reason is required to clear override");
      }
      await clearTripBillingOverride(trip.id, overrideReason.trim());
    },
    onSuccess: () => {
      toast.success("Billing override cleared");
      setOverrideAmount("");
      if (trip) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.tripBillingOverride(trip.id),
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.tripAudit(trip.id) });
      }
      onSaved();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const title =
    variant === "pending" ? "Edit driver submission" : "Edit waybill / trip";
  const description =
    variant === "pending"
      ? "Correct driver data before approval. Changes are audited; invoice sync runs after approval."
      : "Updates the trip and linked draft invoice line when completed. Sent or finalised invoices block edits.";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
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
          name="companyId"
          label="Company"
          options={companyOptions}
          placeholder="Select company"
        />

        <div className="space-y-1.5">
          <Label htmlFor="edit-area">Route / area</Label>
          <Input id="edit-area" {...form.register("areaText")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-pax">Pax</Label>
            <Input
              id="edit-pax"
              type="number"
              min={0}
              {...form.register("paxCount", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-km">Total km</Label>
            <Input
              id="edit-km"
              type="number"
              min={0}
              step="0.1"
              {...form.register("totalKm", { valueAsNumber: true })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Vehicle</Label>
          <Select
            value={form.watch("vehicleId") || ""}
            onValueChange={(v) => form.setValue("vehicleId", v ?? "")}
          >
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea id="edit-notes" rows={2} {...form.register("notes")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-reason">Reason for edit</Label>
          <Textarea
            id="edit-reason"
            rows={2}
            placeholder="Required — shown in audit history"
            {...form.register("editReason")}
          />
          {form.formState.errors.editReason ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.editReason.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Billing override (optional)</p>
          <p className="text-xs text-muted-foreground">
            Beats the rate card on the invoice line. Requires a reason.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="override-amount">Override amount (ZAR)</Label>
              <Input
                id="override-amount"
                type="number"
                min={0}
                step="0.01"
                value={overrideAmount}
                onChange={(e) => setOverrideAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="override-reason">Override reason</Label>
              <Input
                id="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={overrideMutation.isPending || !trip}
              onClick={() => overrideMutation.mutate()}
            >
              Apply override
            </Button>
            {overrideQuery.data ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={clearOverrideMutation.isPending || !trip}
                onClick={() => clearOverrideMutation.mutate()}
              >
                Clear override
              </Button>
            ) : null}
          </div>
        </div>

        {trip ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Audit history</p>
            <TripAuditTimeline tripId={trip.id} enabled={open} />
          </div>
        ) : null}
      </form>
    </FormDialog>
  );
}
