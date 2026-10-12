"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField } from "@/components/forms/form-fields";
import { resolveSelectLabel } from "@/components/forms/select-label";
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
import {
  formatVehicleOptionLabel,
  resolveDefaultVehicleIdForDriver,
  staffWaybillBaseSchema,
  validateStaffWaybillSubmit,
  type StaffWaybillFormValues,
} from "@/features/trips/lib/staff-waybill-form";
import {
  waybillBillingProblems,
  type WaybillMode,
} from "@/features/trips/lib/waybill-billing-readiness";
import { listDrivers } from "@/services/drivers.service";
import { listActiveCompanies } from "@/services/companies.service";
import { listOpenDriverVehicleAssignments } from "@/services/driver-vehicle-assignment.service";
import {
  assignStaffTrip,
  backfillStaffWaybill,
  getStaffWaybillBillingReadiness,
} from "@/services/staff-trips.service";
import { listVehicles } from "@/services/vehicles.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";

function plannedStartFor(date: string, time: string): string {
  return `${date}T${time}:00+02:00`;
}

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

  const form = useForm<StaffWaybillFormValues>({
    resolver: zodResolver(staffWaybillBaseSchema),
    defaultValues: {
      driverId: "",
      date: today,
      time: "08:00",
      companyId: "",
      areaText: "",
      paxCount: 1,
      vehicleId: "",
      openingKm: "",
      closingKm: "",
    },
  });

  const driverId = form.watch("driverId");

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

  const driverVehicleQuery = useQuery({
    queryKey: queryKeys.driverVehicleAssignments(organisationId),
    queryFn: () => listOpenDriverVehicleAssignments(organisationId),
    enabled: open,
  });

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const driverOptions = useMemo(
    () => drivers.map((d) => ({ value: d.id, label: d.full_name })),
    [drivers]
  );
  const companyOptions = useMemo(
    () =>
      (companiesQuery.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
      })),
    [companiesQuery.data]
  );

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const vehicleOptions = useMemo(
    () =>
      vehicles.map((vehicle) => ({
        value: vehicle.id,
        label: formatVehicleOptionLabel(
          vehicle.registration_number,
          vehicle.name
        ),
      })),
    [vehicles]
  );
  const organisationVehicleIds = useMemo(
    () => new Set(vehicles.map((v) => v.id)),
    [vehicles]
  );

  const driverVehicleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of driverVehicleQuery.data ?? []) {
      if (row.driver_id && row.vehicle_id) {
        map.set(row.driver_id, row.vehicle_id);
      }
    }
    return map;
  }, [driverVehicleQuery.data]);

  useEffect(() => {
    if (!open || !driverId) return;
    const defaultVehicle = resolveDefaultVehicleIdForDriver(
      driverId,
      driverVehicleMap
    );
    if (defaultVehicle && organisationVehicleIds.has(defaultVehicle)) {
      form.setValue("vehicleId", defaultVehicle);
    } else {
      form.setValue("vehicleId", "");
    }
  }, [open, driverId, driverVehicleMap, organisationVehicleIds, form]);

  const watchedCompanyId = form.watch("companyId");
  const watchedDate = form.watch("date");
  const companyName =
    companyOptions.find((c) => c.value === watchedCompanyId)?.label ?? null;

  const readinessQuery = useQuery({
    queryKey: [
      "staff-waybill-billing-readiness",
      organisationId,
      watchedCompanyId,
      watchedDate,
    ],
    queryFn: () =>
      getStaffWaybillBillingReadiness(
        organisationId,
        watchedCompanyId,
        plannedStartFor(watchedDate, "12:00")
      ),
    enabled: open && Boolean(watchedCompanyId) && Boolean(watchedDate),
    staleTime: 0,
  });
  const billingProblems = waybillBillingProblems(
    readinessQuery.data,
    companyName,
    mode
  );

  const submitMutation = useMutation({
    mutationFn: async (values: StaffWaybillFormValues) => {
      const plannedStart = plannedStartFor(values.date, values.time);
      const readiness = await getStaffWaybillBillingReadiness(
        organisationId,
        values.companyId,
        plannedStart
      );
      const problems = waybillBillingProblems(
        readiness,
        companyOptions.find((c) => c.value === values.companyId)?.label,
        mode
      );
      if (problems.length > 0) {
        throw new Error(problems[0]);
      }

      const gate = validateStaffWaybillSubmit(mode, values, organisationVehicleIds);
      if (!gate.ok) {
        throw new Error(gate.message);
      }

      if (mode === "send") {
        return assignStaffTrip(
          organisationId,
          values.driverId,
          plannedStart,
          values.companyId,
          values.areaText,
          values.paxCount,
          values.vehicleId?.trim() || null
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
        values.companyId,
        values.areaText,
        values.paxCount,
        values.vehicleId!.trim(),
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

  const showVehicleField = mode === "backfill";

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
            disabled={submitMutation.isPending || billingProblems.length > 0}
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
            items={driverOptions}
            value={form.watch("driverId") || null}
            onValueChange={(v) =>
              form.setValue("driverId", v ?? "", { shouldValidate: true })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select driver">
                {(value) =>
                  resolveSelectLabel(driverOptions, value, "Select driver")
                }
              </SelectValue>
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

        {showVehicleField ? (
          <div className="space-y-1.5">
            <Label>Vehicle</Label>
            <Select
              items={vehicleOptions}
              value={form.watch("vehicleId") || null}
              onValueChange={(v) =>
                form.setValue("vehicleId", v ?? "", { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select vehicle (registration)">
                  {(value) =>
                    resolveSelectLabel(
                      vehicleOptions,
                      value,
                      "Select vehicle (registration)"
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {formatVehicleOptionLabel(
                      vehicle.registration_number,
                      vehicle.name
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.watch("vehicleId")?.trim() && form.formState.isSubmitted ? (
              <p className="text-xs text-destructive">Select a vehicle</p>
            ) : null}
          </div>
        ) : null}

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
          name="companyId"
          label="Company"
          options={companyOptions}
          placeholder="Select company"
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

        {billingProblems.length > 0 ? (
          <div
            role="alert"
            className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {billingProblems.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
          </div>
        ) : null}

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
