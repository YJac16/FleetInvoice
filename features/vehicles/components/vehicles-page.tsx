"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Car, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/features/import/components/csv-import-dialog";
import { vehicleImportSchema } from "@/features/import/schemas/import-schemas";
import { ComplianceExpiryBadge } from "@/features/compliance/components/compliance-expiry-badge";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import { VehicleDocumentsDialog } from "@/features/vehicles/components/vehicle-documents-dialog";
import { listOpenDriverVehicleAssignments } from "@/services/driver-vehicle-assignment.service";
import {
  normalizeVehicleFields,
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
      make: initial?.make ?? "",
      model: initial?.model ?? "",
      model_year:
        initial?.model_year === null || initial?.model_year === undefined
          ? ""
          : String(initial.model_year),
      colour: initial?.colour ?? "",
      classification: initial?.classification ?? "",
      operating_permit_number: initial?.operating_permit_number ?? "",
      operating_permit_expires_on: initial?.operating_permit_expires_on?.slice(0, 10) ?? "",
      license_disc_expires_on: initial?.license_disc_expires_on?.slice(0, 10) ?? "",
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
      onSubmit={form.handleSubmit((values) => {
        const normalized = normalizeVehicleFields(values);
        if (!normalized.ok) {
          toast.error(normalized.message);
          return;
        }
        onSubmit(normalized.data);
      })}
    >
      <TextField control={form.control} name="name" label="Name" />
      <TextField
        control={form.control}
        name="registration_number"
        label="Registration number"
      />
      <TextField control={form.control} name="make" label="Make" />
      <TextField control={form.control} name="model" label="Model" />
      <TextField
        control={form.control}
        name="model_year"
        label="Year"
        type="number"
        placeholder="e.g. 2022"
      />
      <TextField control={form.control} name="colour" label="Colour" />
      <TextField
        control={form.control}
        name="classification"
        label="Classification"
        placeholder="Free text until confirmed"
      />
      <TextField
        control={form.control}
        name="operating_permit_number"
        label="Operating permit (fleet record) number"
      />
      <TextField
        control={form.control}
        name="operating_permit_expires_on"
        label="Operating permit expiry"
        type="date"
      />
      <TextField
        control={form.control}
        name="license_disc_expires_on"
        label="Licence disc expiry"
        type="date"
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

  const assignmentsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.driverVehicleAssignments(organisationId)
      : ["driver-vehicle-assignments", "none"],
    queryFn: () => listOpenDriverVehicleAssignments(organisationId!),
    enabled: Boolean(organisationId),
  });

  const assignmentByVehicle = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof assignmentsQuery.data>[number]
    >();
    for (const row of assignmentsQuery.data ?? []) {
      map.set(row.vehicle_id, row);
    }
    return map;
  }, [assignmentsQuery.data]);

  const columns = useMemo<ColumnDef<Vehicle, unknown>[]>(
    () => [
      { accessorKey: "registration_number", header: "Registration" },
      {
        id: "make_model",
        header: "Make / model",
        cell: ({ row }) => formatVehicleLabel(row.original),
      },
      { accessorKey: "model_year", header: "Year" },
      {
        id: "assigned_driver",
        header: "Assigned driver",
        cell: ({ row }) =>
          assignmentByVehicle.get(row.original.id)?.drivers?.full_name ?? "—",
      },
      {
        accessorKey: "operating_permit_expires_on",
        header: "Permit",
        cell: ({ row }) => (
          <ComplianceExpiryBadge
            expiresOn={row.original.operating_permit_expires_on}
          />
        ),
      },
      {
        accessorKey: "license_disc_expires_on",
        header: "Disc",
        cell: ({ row }) => (
          <ComplianceExpiryBadge
            expiresOn={row.original.license_disc_expires_on}
          />
        ),
      },
      {
        accessorKey: "vehicle_type",
        header: "Type",
        cell: ({ row }) =>
          VEHICLE_TYPE_LABELS[row.original.vehicle_type] ??
          row.original.vehicle_type,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [assignmentByVehicle]
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
