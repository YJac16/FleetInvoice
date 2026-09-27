"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Car, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/features/import/components/csv-import-dialog";
import { vehicleImportSchema } from "@/features/import/schemas/import-schemas";
import { ComplianceExpiryBadge } from "@/features/compliance/components/compliance-expiry-badge";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import { VehicleCaptureForm } from "@/features/vehicles/components/vehicle-capture-form";
import { VehicleDocumentsDialog } from "@/features/vehicles/components/vehicle-documents-dialog";
import { useComplianceScanAssist } from "@/hooks/use-compliance-scan-assist";
import { listOpenDriverVehicleAssignments } from "@/services/driver-vehicle-assignment.service";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { VEHICLE_TYPE_LABELS } from "@/lib/constants";
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

function VehicleFormDialog({
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
  const scanAssist = useComplianceScanAssist(organisationId);
  const companyOptions = [{ label: "None", value: NONE }, ...companies];

  return (
    <VehicleCaptureForm
      initial={initial}
      companies={companyOptions}
      scanAssistEnabled={scanAssist.data === true}
      submitting={submitting}
      onSubmit={onSubmit}
    />
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
        createLabel="Quick add"
        headerActions={
          canManage ? (
            <>
              <Button render={<Link href="/vehicles/capture" />}>Capture vehicle</Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Import CSV
              </Button>
            </>
          ) : null
        }
        rowActions={(row) => (
          <>
            {canManage ? (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={`/vehicles/${row.id}/capture`} />}
              >
                Capture
              </Button>
            ) : null}
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
          <VehicleFormDialog
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
