"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Car, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/features/import/components/csv-import-dialog";
import { vehicleImportSchema } from "@/features/import/schemas/import-schemas";
import { VehicleDocumentsDialog } from "@/features/vehicles/components/vehicle-documents-dialog";
import {
  parseCapacity,
  vehicleSchema,
  type VehicleValues,
} from "@/features/vehicles/schemas/vehicle";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import {
  ENTITY_STATUSES,
  STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  VEHICLE_TYPES,
} from "@/lib/constants";
import {
  createVehicle,
  createVehiclesBulk,
  deleteVehicle,
  listVehicles,
  restoreVehicle,
  updateVehicle,
} from "@/services/vehicles.service";
import type { Vehicle } from "@/types";
import { queryKeys } from "@/utils/query";

const NONE = "none";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

const vehicleTypeOptions = VEHICLE_TYPES.map((type) => ({
  label: VEHICLE_TYPE_LABELS[type],
  value: type,
}));

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NONE) return null;
  return trimmed;
}

function VehicleForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: Vehicle;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { companies } = useEntityOptions(organisationId);
  const form = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: initial?.name ?? "",
      registration_number: initial?.registration_number ?? "",
      vehicle_type: initial?.vehicle_type ?? "other",
      capacity:
        initial?.capacity === null || initial?.capacity === undefined
          ? ""
          : String(initial.capacity),
      company_id: initial?.company_id ?? NONE,
      status: initial?.status ?? "active",
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          registration_number: emptyToNull(values.registration_number),
          vehicle_type: values.vehicle_type,
          capacity: parseCapacity(values.capacity),
          company_id: emptyToNull(values.company_id),
          status: values.status,
        })
      )}
    >
      <TextField control={form.control} name="name" label="Name" />
      <TextField
        control={form.control}
        name="registration_number"
        label="Registration number"
      />
      <SelectField
        control={form.control}
        name="vehicle_type"
        label="Vehicle type"
        options={vehicleTypeOptions}
      />
      <SelectField
        control={form.control}
        name="company_id"
        label="Company (optional)"
        options={[{ label: "None", value: NONE }, ...companies]}
      />
      <TextField
        control={form.control}
        name="capacity"
        label="Capacity"
        type="number"
        placeholder="Optional"
      />
      <SelectField
        control={form.control}
        name="status"
        label="Status"
        options={statusOptions}
      />
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function VehiclesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("vehicles:manage");
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [docsVehicle, setDocsVehicle] = useState<Vehicle | null>(null);

  const columns = useMemo<ColumnDef<Vehicle, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "registration_number", header: "Registration" },
      {
        accessorKey: "vehicle_type",
        header: "Type",
        cell: ({ row }) =>
          VEHICLE_TYPE_LABELS[row.original.vehicle_type] ??
          row.original.vehicle_type,
      },
      { accessorKey: "capacity", header: "Capacity" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    []
  );

  return (
    <>
      <EntityCrudPage<Vehicle>
        title="Vehicles"
        description="Manage fleet vehicles for the active organisation."
        organisationId={organisationId}
        queryKey={
          organisationId
            ? queryKeys.vehicles(organisationId)
            : ["vehicles", "none"]
        }
        columns={columns}
        list={listVehicles}
        create={
          canManage
            ? (orgId, values) =>
                createVehicle(
                  orgId,
                  values as Parameters<typeof createVehicle>[1]
                )
            : undefined
        }
        update={
          canManage
            ? (id, values) =>
                updateVehicle(id, values as Parameters<typeof updateVehicle>[1])
            : undefined
        }
        remove={canManage ? deleteVehicle : undefined}
        restore={canManage ? restoreVehicle : undefined}
        canManage={canManage}
        searchFilter={(row, query) =>
          [row.name, row.registration_number, row.vehicle_type]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        }
        emptyIcon={Car}
        createLabel="Add vehicle"
        headerActions={
          canManage ? (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
          ) : null
        }
        rowActions={(row) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDocsVehicle(row)}
          >
            Docs
          </Button>
        )}
        renderForm={({ initial, onSubmit, submitting }) => (
          <VehicleForm
            key={initial?.id ?? "create"}
            organisationId={organisationId}
            initial={initial}
            onSubmit={onSubmit}
            submitting={submitting}
          />
        )}
      />

      {organisationId ? (
        <>
          <CsvImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            title="Import vehicles"
            templateFilename="vehicles-template.csv"
            columns={[
              { key: "name", label: "Name", required: true },
              { key: "registration_number", label: "Registration" },
              { key: "vehicle_type", label: "Type" },
              { key: "capacity", label: "Capacity" },
              { key: "status", label: "Status" },
            ]}
            schema={vehicleImportSchema}
            onImport={async (rows) => {
              await createVehiclesBulk(
                organisationId,
                rows.map((row) => ({
                  name: row.name,
                  registration_number: row.registration_number || null,
                  vehicle_type: row.vehicle_type,
                  capacity: row.capacity,
                  status: row.status,
                }))
              );
              await queryClient.invalidateQueries({
                queryKey: queryKeys.vehicles(organisationId),
              });
            }}
          />
          <VehicleDocumentsDialog
            open={Boolean(docsVehicle)}
            onOpenChange={(open) => !open && setDocsVehicle(null)}
            organisationId={organisationId}
            vehicle={docsVehicle}
            canManage={canManage}
          />
        </>
      ) : null}
    </>
  );
}
