"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField, TextField, TextAreaField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fuelFillupSchema,
  parseNonNegativeNumber,
  parseOptionalNumber,
  parsePositiveNumber,
  type FuelFillupValues,
} from "@/features/fuel/schemas/fuel-fillup";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import {
  listFuelFillups,
  logFuelFillup,
} from "@/services/fuel-fillups.service";
import { listVehicles } from "@/services/vehicles.service";
import type { FuelFillup } from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

const NONE = "none";

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NONE) return null;
  return trimmed;
}

function LogFuelForm({
  organisationId,
  onDone,
}: {
  organisationId: string;
  onDone: () => void;
}) {
  const { companies } = useEntityOptions(organisationId);
  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles(organisationId),
    queryFn: () => listVehicles(organisationId),
  });

  const form = useForm<FuelFillupValues>({
    resolver: zodResolver(fuelFillupSchema),
    defaultValues: {
      vehicle_id: "",
      company_id: NONE,
      odometer_km: "",
      litres: "",
      unit_price: "",
      station_name: "",
      notes: "",
      filled_at: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FuelFillupValues) => {
      const vehicle = (vehiclesQuery.data ?? []).find(
        (v) => v.id === values.vehicle_id
      );
      return logFuelFillup({
        organisationId,
        vehicleId: values.vehicle_id,
        odometerKm: parseNonNegativeNumber(values.odometer_km, "Odometer"),
        litres: parsePositiveNumber(values.litres, "Litres"),
        companyId: emptyToNull(values.company_id) ?? vehicle?.company_id ?? null,
        unitPrice: parseOptionalNumber(values.unit_price),
        stationName: emptyToNull(values.station_name),
        notes: emptyToNull(values.notes),
        filledAt: emptyToNull(values.filled_at),
      });
    },
    onSuccess: () => {
      toast.success("Fuel fill-up logged");
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const vehicleOptions = (vehiclesQuery.data ?? []).map((v) => ({
    label: formatVehicleLabel(v),
    value: v.id,
  }));

  return (
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
      <SelectField
        control={form.control}
        name="company_id"
        label="Company (optional)"
        options={[{ label: "Use vehicle default", value: NONE }, ...companies]}
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
      <TextField
        control={form.control}
        name="filled_at"
        label="Filled at (optional)"
        type="datetime-local"
      />
      <TextAreaField control={form.control} name="notes" label="Notes" />
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Log fill-up"}
      </Button>
    </form>
  );
}

export function FuelFillupsPage({
  title = "Fuel",
  description = "Log and review vehicle fill-ups. Odometer must not go backwards.",
}: {
  title?: string;
  description?: string;
} = {}) {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canView = can("fuel:view") || can("fuel:manage") || can("fuel:self");
  const canManage = can("fuel:manage");
  const [open, setOpen] = useState(false);

  const fillupsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.fuelFillups(organisationId)
      : ["fuel-fillups", "none"],
    queryFn: () => listFuelFillups(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  const columns = useMemo<ColumnDef<FuelFillup, unknown>[]>(
    () => [
      {
        id: "vehicle",
        header: "Vehicle",
        cell: ({ row }) =>
          row.original.vehicles?.name ?? row.original.vehicle_id.slice(0, 8),
      },
      {
        id: "company",
        header: "Company",
        cell: ({ row }) => row.original.companies?.name ?? "—",
      },
      {
        accessorKey: "odometer_km",
        header: "Odometer (km)",
      },
      { accessorKey: "litres", header: "Litres" },
      {
        accessorKey: "total_amount",
        header: "Amount",
        cell: ({ row }) =>
          row.original.total_amount != null
            ? `${row.original.currency} ${row.original.total_amount}`
            : "—",
      },
      {
        accessorKey: "filled_at",
        header: "Filled at",
        cell: ({ row }) => formatDateTime(row.original.filled_at),
      },
    ],
    []
  );

  if (!canView) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <EmptyState
          title="No access"
          description="You do not have permission to view fuel records."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          canManage && organisationId ? (
            <Button onClick={() => setOpen(true)}>Log fill-up</Button>
          ) : null
        }
      />

      {!organisationId ? (
        <EmptyState
          title="No organisation"
          description="Select an organisation to view fuel fill-ups."
        />
      ) : fillupsQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <DataTable
          columns={columns}
          data={fillupsQuery.data ?? []}
          emptyMessage="No fill-ups yet. Log the first fuel fill-up for a vehicle."
        />
      )}

      {organisationId ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log fuel fill-up</DialogTitle>
            </DialogHeader>
            <LogFuelForm
              organisationId={organisationId}
              onDone={async () => {
                setOpen(false);
                await queryClient.invalidateQueries({
                  queryKey: queryKeys.fuelFillups(organisationId),
                });
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
