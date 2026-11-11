"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AdminQueryGate } from "@/components/admin/admin-loading";
import { BusyButton } from "@/components/admin/busy-button";
import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SelectField, TextField, TextAreaField } from "@/components/forms/form-fields";
import { Badge } from "@/components/ui/badge";
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
  parsePositiveNumber,
  type FuelFillupValues,
} from "@/features/fuel/schemas/fuel-fillup";
import { FuelPricesPanel } from "@/features/fuel/components/fuel-prices-panel";
import { VehicleFuelHistoryPanel } from "@/features/fuel/components/vehicle-fuel-history";
import { isPricedFill, needsPrice } from "@/features/fuel/lib/fuel-pricing";
import { FUEL_TYPES, fuelTypeLabel } from "@/lib/fuel/fuel-types";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import {
  listFuelFillups,
  logFuelFillup,
} from "@/services/fuel-fillups.service";
import { listFuelPrices } from "@/services/fuel-prices.service";
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

/** Finance-only: "after save" result shown to admin / manager / owner. */
export function fuelSavedMessage(row: FuelFillup, showPrice: boolean): string {
  if (!showPrice) return "Fuel fill-up logged";
  if (row.price_status === "priced" && row.total_amount != null) {
    return `Fuel fill-up logged · locked at ${row.currency ?? "ZAR"} ${Number(row.total_amount).toFixed(2)}`;
  }
  if (row.price_status === "needs_price") {
    return "Fuel fill-up logged · Needs price (no confirmed rate on the slip date)";
  }
  return "Fuel fill-up logged";
}

/**
 * No unit price field for anyone: the price comes from the confirmed fuel
 * price table on the slip date (00094).
 */
export function LogFuelForm({
  organisationId,
  onDone,
  showPrice = false,
}: {
  organisationId: string;
  onDone: () => void;
  /** finance only: show the locked amount / Needs price after save */
  showPrice?: boolean;
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
      fuel_type: "",
      odometer_km: "",
      litres: "",
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
        fuelType: values.fuel_type,
        stationName: emptyToNull(values.station_name),
        notes: emptyToNull(values.notes),
        filledAt: emptyToNull(values.filled_at),
      });
    },
    onSuccess: (row) => {
      const message = fuelSavedMessage(row, showPrice);
      if (showPrice && row.price_status === "needs_price") toast.warning(message);
      else toast.success(message);
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
      <SelectField
        control={form.control}
        name="fuel_type"
        label="Fuel type"
        options={[...FUEL_TYPES]}
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
      <BusyButton
        type="submit"
        className="w-full"
        pending={mutation.isPending}
        pendingLabel="Saving…"
      >
        Log fill-up
      </BusyButton>
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
  const canViewFuelCost = can("invoices:view") && can("rate_cards:view");
  const canManageFuelPrices = canViewFuelCost && can("rate_cards:manage");
  const [open, setOpen] = useState(false);

  const fillupsQuery = useQuery({
    queryKey: organisationId
      ? [...queryKeys.fuelFillups(organisationId), canViewFuelCost]
      : ["fuel-fillups", "none"],
    queryFn: () =>
      listFuelFillups(organisationId!, { includeAmounts: canViewFuelCost }),
    enabled: Boolean(organisationId) && canView,
  });

  const pricesQuery = useQuery({
    queryKey: organisationId ? queryKeys.fuelPrices(organisationId) : ["fuel-prices", "none"],
    queryFn: () => listFuelPrices(organisationId!),
    enabled: Boolean(organisationId) && canViewFuelCost,
  });

  const fills = useMemo(() => fillupsQuery.data ?? [], [fillupsQuery.data]);
  const needsPriceCount = canViewFuelCost ? fills.filter(needsPrice).length : 0;
  const pricedTotal = canViewFuelCost
    ? fills.filter(isPricedFill).reduce((sum, f) => sum + Number(f.total_amount), 0)
    : 0;

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
      {
        id: "fuel_type",
        header: "Fuel type",
        cell: ({ row }) => fuelTypeLabel(row.original.fuel_type),
      },
      { accessorKey: "litres", header: "Litres" },
      ...(canViewFuelCost
        ? [
            {
              accessorKey: "total_amount",
              header: "Amount",
              cell: ({ row }: { row: { original: FuelFillup } }) =>
                needsPrice(row.original) ? (
                  <Badge variant="destructive">Needs price</Badge>
                ) : row.original.total_amount != null ? (
                  `${row.original.currency ?? ""} ${Number(row.original.total_amount).toFixed(2)}`.trim()
                ) : (
                  "—"
                ),
            } as ColumnDef<FuelFillup, unknown>,
          ]
        : []),
      {
        accessorKey: "filled_at",
        header: "Filled at",
        cell: ({ row }) => formatDateTime(row.original.filled_at),
      },
    ],
    [canViewFuelCost]
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
      ) : (
        <AdminQueryGate
          label="Loading fuel fill-ups"
          isLoading={fillupsQuery.isLoading}
          isFetching={fillupsQuery.isFetching}
          isError={fillupsQuery.isError}
          data={fillupsQuery.data}
          error={fillupsQuery.error}
          onRetry={() => {
            void fillupsQuery.refetch();
          }}
          rows={5}
        >
          <div className="space-y-4">
            {canViewFuelCost ? (
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-1">
                  Priced total: {pricedTotal.toFixed(2)}
                </span>
                <span className="rounded-md bg-muted px-2 py-1" data-testid="needs-price-count">
                  Needs price: {needsPriceCount}
                </span>
              </div>
            ) : null}
            <DataTable
              columns={columns}
              data={fills}
              emptyMessage="No fill-ups yet. Log the first fuel fill-up for a vehicle."
            />
            {canViewFuelCost ? (
              <>
                <FuelPricesPanel
                  organisationId={organisationId}
                  prices={pricesQuery.data ?? []}
                  fills={fills}
                  canManage={canManageFuelPrices}
                />
                <VehicleFuelHistoryPanel
                  organisationId={organisationId}
                  fills={fills}
                  prices={pricesQuery.data ?? []}
                />
              </>
            ) : null}
          </div>
        </AdminQueryGate>
      )}

      {organisationId ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log fuel fill-up</DialogTitle>
            </DialogHeader>
            <LogFuelForm
              organisationId={organisationId}
              showPrice={canViewFuelCost}
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
