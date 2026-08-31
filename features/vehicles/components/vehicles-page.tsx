"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Car, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/features/import/components/csv-import-dialog";
import { vehicleImportSchema } from "@/features/import/schemas/import-schemas";
import { VehicleDocumentsDialog } from "@/features/vehicles/components/vehicle-documents-dialog";
import { VehicleUpdatesDialog } from "@/features/vehicles/components/vehicle-updates-dialog";
import {
  formatMakeModel,
  formatOdometerKm,
  parseCapacity,
  parseKm,
  parseYear,
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
import { listDrivers } from "@/services/drivers.service";
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
  const driversQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.drivers(organisationId)
      : ["drivers", "none"],
    queryFn: () => listDrivers(organisationId!),
    enabled: Boolean(organisationId),
  });
  const driverOptions = useMemo(
    () => [
      { label: "None", value: NONE },
      ...(driversQuery.data ?? []).map((driver) => ({
        label: driver.full_name,
        value: driver.id,
      })),
    ],
    [driversQuery.data]
  );

  const form = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: initial?.name ?? "",
      registration_number: initial?.registration_number ?? "",
      make: initial?.make ?? "",
      model: initial?.model ?? "",
      year: initial?.year == null ? "" : String(initial.year),
      vehicle_type: initial?.vehicle_type ?? "other",
      capacity:
        initial?.capacity === null || initial?.capacity === undefined
          ? ""
          : String(initial.capacity),
      company_id: initial?.company_id ?? NONE,
      title_holder: initial?.title_holder ?? "",
      owner_name: initial?.owner_name ?? "",
      department: initial?.department ?? "",
      assigned_driver_id: initial?.assigned_driver_id ?? NONE,
      permit_number: initial?.permit_number ?? "",
      permit_expiry: initial?.permit_expiry ?? "",
      licence_expiry: initial?.licence_expiry ?? "",
      licence_type: initial?.licence_type ?? "",
      comments: initial?.comments ?? "",
      original_natis_in_file: initial?.original_natis_in_file ?? false,
      authority: initial?.authority ?? "",
      current_odometer_km:
        initial?.current_odometer_km == null
          ? ""
          : String(initial.current_odometer_km),
      status: initial?.status ?? "active",
    },
  });

  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          registration_number: emptyToNull(values.registration_number),
          make: emptyToNull(values.make),
          model: emptyToNull(values.model),
          year: parseYear(values.year),
          vehicle_type: values.vehicle_type,
          capacity: parseCapacity(values.capacity),
          company_id: emptyToNull(values.company_id),
          title_holder: emptyToNull(values.title_holder),
          owner_name: emptyToNull(values.owner_name),
          department: emptyToNull(values.department),
          assigned_driver_id: emptyToNull(values.assigned_driver_id),
          permit_number: emptyToNull(values.permit_number),
          permit_expiry: emptyToNull(values.permit_expiry),
          licence_expiry: emptyToNull(values.licence_expiry),
          licence_type: emptyToNull(values.licence_type),
          comments: emptyToNull(values.comments),
          original_natis_in_file: values.original_natis_in_file,
          authority: emptyToNull(values.authority),
          current_odometer_km: parseKm(values.current_odometer_km),
          status: values.status,
        })
      )}
    >
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Identity</h3>
        <TextField control={form.control} name="name" label="Name" />
        <TextField
          control={form.control}
          name="registration_number"
          label="Registration number"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField control={form.control} name="make" label="Make" />
          <TextField control={form.control} name="model" label="Model" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="year"
            label="Year"
            type="number"
            placeholder="Optional"
          />
          <TextField
            control={form.control}
            name="capacity"
            label="Capacity"
            type="number"
            placeholder="Optional"
          />
        </div>
        <SelectField
          control={form.control}
          name="vehicle_type"
          label="Vehicle type"
          options={vehicleTypeOptions}
        />
        <TextField
          control={form.control}
          name="current_odometer_km"
          label="Current km"
          type="number"
          placeholder="Optional"
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Ownership</h3>
        <SelectField
          control={form.control}
          name="company_id"
          label="Billed company (optional)"
          options={[{ label: "None", value: NONE }, ...companies]}
        />
        <TextField
          control={form.control}
          name="title_holder"
          label="Title holder"
        />
        <TextField control={form.control} name="owner_name" label="Owner" />
        <TextField
          control={form.control}
          name="department"
          label="Department"
        />
        <SelectField
          control={form.control}
          name="assigned_driver_id"
          label="Assigned driver"
          options={driverOptions}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Permit and licence</h3>
        <TextField
          control={form.control}
          name="permit_number"
          label="Permit number"
        />
        <TextField
          control={form.control}
          name="permit_expiry"
          label="Permit expiry (leave blank if indefinite)"
          type="date"
        />
        <TextField
          control={form.control}
          name="licence_expiry"
          label="Licence expiry"
          type="date"
        />
        <TextField
          control={form.control}
          name="licence_type"
          label="Type of licence"
        />
        <TextField control={form.control} name="authority" label="Authority" />
        <CheckboxField
          control={form.control}
          name="original_natis_in_file"
          label="Original NaTIS in file"
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Operations</h3>
        <TextAreaField control={form.control} name="comments" label="Comments" />
        <SelectField
          control={form.control}
          name="status"
          label="Status"
          options={statusOptions}
        />
      </section>

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
  const [updatesVehicle, setUpdatesVehicle] = useState<Vehicle | null>(null);

  const columns = useMemo<ColumnDef<Vehicle, unknown>[]>(
    () => [
      {
        accessorKey: "registration_number",
        header: "Registration",
        cell: ({ row }) => row.original.registration_number || "—",
      },
      {
        id: "make_model",
        header: "Make & model",
        cell: ({ row }) => formatMakeModel(row.original),
      },
      {
        accessorKey: "year",
        header: "Year",
        cell: ({ row }) => row.original.year ?? "—",
      },
      {
        id: "km",
        header: "Km",
        cell: ({ row }) => formatOdometerKm(row.original.current_odometer_km),
      },
      {
        id: "assigned_driver",
        header: "Assigned driver",
        cell: ({ row }) => row.original.assigned_driver?.full_name ?? "—",
      },
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
        description="Fleet register with registration, make and model, km, and assigned driver. Use Updates for km readings and service notes."
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
          [
            row.name,
            row.registration_number,
            row.make,
            row.model,
            row.assigned_driver?.full_name,
            row.vehicle_type,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        }
        emptyIcon={Car}
        createLabel="Add vehicle"
        formDialogClassName="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        archiveDescription={(row) =>
          `Archive ${row.name}${
            row.registration_number ? ` (${row.registration_number})` : ""
          }? This removes it from the active fleet. You can restore it from the Archived tab.`
        }
        headerActions={
          canManage ? (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
          ) : null
        }
        rowActions={(row) => (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUpdatesVehicle(row)}
            >
              Updates
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDocsVehicle(row)}
            >
              Docs
            </Button>
          </>
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
              { key: "make", label: "Make" },
              { key: "model", label: "Model" },
              { key: "year", label: "Year" },
              { key: "vehicle_type", label: "Type" },
              { key: "capacity", label: "Capacity" },
              { key: "title_holder", label: "Title holder" },
              { key: "owner_name", label: "Owner" },
              { key: "department", label: "Department" },
              { key: "permit_number", label: "Permit number" },
              { key: "permit_expiry", label: "Permit expiry" },
              { key: "licence_expiry", label: "Licence expiry" },
              { key: "licence_type", label: "Type of licence" },
              { key: "comments", label: "Comments" },
              { key: "original_natis_in_file", label: "Original NaTIS in file" },
              { key: "authority", label: "Authority" },
              { key: "current_odometer_km", label: "Current km" },
              { key: "status", label: "Status" },
            ]}
            schema={vehicleImportSchema}
            onImport={async (rows) => {
              await createVehiclesBulk(
                organisationId,
                rows.map((row) => ({
                  name: row.name,
                  registration_number: row.registration_number || null,
                  make: row.make || null,
                  model: row.model || null,
                  year: row.year,
                  vehicle_type: row.vehicle_type,
                  capacity: row.capacity,
                  title_holder: row.title_holder || null,
                  owner_name: row.owner_name || null,
                  department: row.department || null,
                  permit_number: row.permit_number || null,
                  permit_expiry: row.permit_expiry || null,
                  licence_expiry: row.licence_expiry || null,
                  licence_type: row.licence_type || null,
                  comments: row.comments || null,
                  original_natis_in_file: row.original_natis_in_file,
                  authority: row.authority || null,
                  current_odometer_km: row.current_odometer_km,
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
          <VehicleUpdatesDialog
            open={Boolean(updatesVehicle)}
            onOpenChange={(open) => !open && setUpdatesVehicle(null)}
            organisationId={organisationId}
            vehicle={updatesVehicle}
            canManage={canManage}
          />
        </>
      ) : null}
    </>
  );
}
