"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField, TextField, TextAreaField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fuelFillupSchema,
  parseNonNegativeNumber,
  parseOptionalNumber,
  parsePositiveNumber,
  type FuelFillupValues,
} from "@/features/fuel/schemas/fuel-fillup";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { logFuelFillup } from "@/services/fuel-fillups.service";
import { listMyDriverTrips } from "@/services/trip-assignments.service";
import { listVehicles } from "@/services/vehicles.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function DriverFuelPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canSelf = can("fuel:self");

  const vehiclesQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.vehicles(organisationId)
      : ["vehicles", "none"],
    queryFn: () => listVehicles(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.driverTrips(organisationId)
      : ["driver-trips", "none"],
    queryFn: () => listMyDriverTrips(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const form = useForm<FuelFillupValues>({
    resolver: zodResolver(fuelFillupSchema),
    defaultValues: {
      vehicle_id: "",
      odometer_km: "",
      litres: "",
      unit_price: "",
      station_name: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (form.getValues("vehicle_id")) return;
    const active =
      (tripsQuery.data ?? []).find((t) => t.status === "in_progress") ??
      (tripsQuery.data ?? []).find((t) => t.status === "assigned");
    const vehicleId = active?.trip_assignments?.find(
      (a) => !a.released_at
    )?.vehicle_id;
    if (vehicleId) {
      form.setValue("vehicle_id", vehicleId);
    }
  }, [tripsQuery.data, form]);

  const mutation = useMutation({
    mutationFn: async (values: FuelFillupValues) => {
      if (!organisationId) throw new Error("No organisation");
      const vehicle = (vehiclesQuery.data ?? []).find(
        (v) => v.id === values.vehicle_id
      );
      return logFuelFillup({
        organisationId,
        vehicleId: values.vehicle_id,
        odometerKm: parseNonNegativeNumber(values.odometer_km, "Odometer"),
        litres: parsePositiveNumber(values.litres, "Litres"),
        companyId: vehicle?.company_id ?? null,
        unitPrice: parseOptionalNumber(values.unit_price),
        stationName: emptyToNull(values.station_name),
        notes: emptyToNull(values.notes),
      });
    },
    onSuccess: async () => {
      toast.success("Fuel fill-up logged");
      form.reset({
        vehicle_id: form.getValues("vehicle_id"),
        odometer_km: "",
        litres: "",
        unit_price: "",
        station_name: "",
        notes: "",
      });
      if (organisationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.fuelFillups(organisationId),
        });
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!canSelf) {
    return (
      <div>
        <PageHeader title="Log fuel" description="Record a vehicle fill-up." />
        <EmptyState
          title="Driver access required"
          description="Link your profile to a driver record to log fuel."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="Log fuel" description="Record a vehicle fill-up." />
        <EmptyState
          title="No organisation"
          description="You are not an active member of any organisation yet."
        />
      </div>
    );
  }

  const vehicleOptions = (vehiclesQuery.data ?? []).map((v) => ({
    label: v.registration_number
      ? `${v.name} (${v.registration_number})`
      : v.name,
    value: v.id,
  }));

  return (
    <div>
      <PageHeader
        title="Log fuel"
        description="Enter odometer km and litres. Odometer cannot be lower than the last fill for that vehicle."
      />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>New fill-up</CardTitle>
          <CardDescription>
            Amounts are optional; company is taken from the vehicle when set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            <SelectField
              control={form.control}
              name="vehicle_id"
              label="Vehicle"
              options={vehicleOptions}
            />
            <TextField
              control={form.control}
              name="odometer_km"
              label="Odometer (km)"
              type="number"
            />
            <TextField
              control={form.control}
              name="litres"
              label="Litres"
              type="number"
            />
            <TextField
              control={form.control}
              name="unit_price"
              label="Unit price (optional)"
              type="number"
            />
            <TextField
              control={form.control}
              name="station_name"
              label="Station (optional)"
            />
            <TextAreaField control={form.control} name="notes" label="Notes" />
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Log fill-up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
