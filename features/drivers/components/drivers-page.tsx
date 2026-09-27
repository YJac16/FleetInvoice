"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleUser, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";

import { useOrg } from "@/components/layout/org-context";
import { ComplianceExpiryBadge } from "@/features/compliance/components/compliance-expiry-badge";
import { PRDP_SHORT_LABEL } from "@/features/compliance/lib/prdp-label";
import { DriverCaptureForm } from "@/features/drivers/components/driver-capture-form";
import { useComplianceScanAssist } from "@/hooks/use-compliance-scan-assist";
import { DriverVehicleAssignDialog } from "@/features/drivers/components/driver-vehicle-assign-dialog";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/features/import/components/csv-import-dialog";
import { driverImportSchema } from "@/features/import/schemas/import-schemas";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createDriver,
  createDriversBulk,
  deleteDriver,
  listDrivers,
  restoreDriver,
  updateDriver,
} from "@/services/drivers.service";
import { listOpenDriverVehicleAssignments } from "@/services/driver-vehicle-assignment.service";
import { listMembers } from "@/services/users.service";
import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import type { Driver } from "@/types";
import { queryKeys } from "@/utils/query";

function DriverFormDialog({
  initial,
  onSubmit,
  submitting,
  organisationId,
}: {
  initial?: Driver;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
  organisationId: string;
}) {
  const membersQuery = useQuery({
    queryKey: queryKeys.members(organisationId),
    queryFn: () => listMembers(organisationId),
  });
  const scanAssist = useComplianceScanAssist(organisationId);

  const profileOptions = useMemo(() => {
    const options = [{ label: "None", value: "" }];
    for (const member of membersQuery.data ?? []) {
      const profile = member.profiles;
      if (!profile) continue;
      options.push({
        value: profile.id,
        label: profile.full_name || profile.email || profile.id.slice(0, 8),
      });
    }
    return options;
  }, [membersQuery.data]);

  return (
    <DriverCaptureForm
      initial={initial}
      profileOptions={profileOptions}
      scanAssistEnabled={scanAssist.data === true}
      submitting={submitting}
      onSubmit={onSubmit}
    />
  );
}

export function DriversPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("drivers:manage");
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [assignDriver, setAssignDriver] = useState<Driver | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.driverVehicleAssignments(organisationId)
      : ["driver-vehicle-assignments", "none"],
    queryFn: () => listOpenDriverVehicleAssignments(organisationId!),
    enabled: Boolean(organisationId),
  });

  const assignmentByDriver = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof assignmentsQuery.data>[number]
    >();
    for (const row of assignmentsQuery.data ?? []) {
      map.set(row.driver_id, row);
    }
    return map;
  }, [assignmentsQuery.data]);

  const columns = useMemo<ColumnDef<Driver, unknown>[]>(
    () => [
      { accessorKey: "full_name", header: "Name" },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "license_number", header: "License" },
      {
        accessorKey: "license_code",
        header: "Code",
        cell: ({ row }) =>
          row.original.license_code === "Other"
            ? `Other: ${row.original.license_code_other ?? ""}`
            : row.original.license_code ?? "—",
      },
      {
        accessorKey: "license_expires_on",
        header: "Licence",
        cell: ({ row }) => (
          <ComplianceExpiryBadge expiresOn={row.original.license_expires_on} />
        ),
      },
      {
        accessorKey: "pdp_expires_on",
        header: PRDP_SHORT_LABEL,
        cell: ({ row }) => (
          <ComplianceExpiryBadge expiresOn={row.original.pdp_expires_on} />
        ),
      },
      {
        id: "assigned_vehicle",
        header: "Assigned vehicle",
        cell: ({ row }) => {
          const a = assignmentByDriver.get(row.original.id);
          if (!a?.vehicles) return "—";
          return formatVehicleLabel(a.vehicles);
        },
      },
      {
        id: "linked_user",
        header: "Linked user",
        cell: ({ row }) =>
          row.original.profiles?.full_name ||
          row.original.profiles?.email ||
          "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [assignmentByDriver]
  );

  return (
    <>
      <EntityCrudPage<Driver>
        title="Drivers"
        description="Manage drivers for the active organisation."
        organisationId={organisationId}
        queryKey={
          organisationId
            ? queryKeys.drivers(organisationId)
            : ["drivers", "none"]
        }
        columns={columns}
        list={listDrivers}
        create={
          canManage
            ? (orgId, values) =>
                createDriver(orgId, values as Parameters<typeof createDriver>[1])
            : undefined
        }
        update={
          canManage
            ? (id, values) =>
                updateDriver(id, values as Parameters<typeof updateDriver>[1])
            : undefined
        }
        remove={canManage ? deleteDriver : undefined}
        restore={canManage ? restoreDriver : undefined}
        canManage={canManage}
        searchFilter={(row, query) =>
          [
            row.full_name,
            row.email,
            row.phone,
            row.license_number,
            row.profiles?.email,
            row.profiles?.full_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        }
        emptyIcon={CircleUser}
        createLabel="Quick add"
        headerActions={
          canManage ? (
            <>
              <Button render={<Link href="/drivers/capture" />}>Capture driver</Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Import CSV
              </Button>
            </>
          ) : null
        }
        rowActions={
          canManage
            ? (row) => (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link href={`/drivers/${row.id}/capture`} />}
                  >
                    Capture
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAssignDriver(row)}
                  >
                    Vehicle
                  </Button>
                </>
              )
            : undefined
        }
        renderForm={({ initial, onSubmit, submitting }) =>
          organisationId ? (
            <DriverFormDialog
              key={initial?.id ?? "create"}
              initial={initial}
              onSubmit={onSubmit}
              submitting={submitting}
              organisationId={organisationId}
            />
          ) : null
        }
      />

      {organisationId ? (
        <CsvImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          title="Import drivers"
          templateFilename="drivers-template.csv"
          columns={[
            { key: "full_name", label: "Full name", required: true },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "license_number", label: "License number" },
            { key: "license_code", label: "Licence code" },
            { key: "license_code_other", label: "Licence code (other)" },
            { key: "license_expires_on", label: "Licence expires (YYYY-MM-DD)" },
            { key: "pdp_number", label: `${PRDP_SHORT_LABEL} number` },
            { key: "pdp_expires_on", label: `${PRDP_SHORT_LABEL} expires` },
            { key: "status", label: "Status" },
          ]}
          schema={driverImportSchema}
          onImport={async (rows) => {
            await createDriversBulk(
              organisationId,
              rows.map((row) => ({
                full_name: row.full_name,
                email: row.email || null,
                phone: row.phone || null,
                license_number: row.license_number || null,
                license_code: row.license_code || null,
                license_code_other: row.license_code_other || null,
                license_expires_on: row.license_expires_on || null,
                pdp_number: row.pdp_number || null,
                pdp_expires_on: row.pdp_expires_on || null,
                status: row.status,
              }))
            );
            await queryClient.invalidateQueries({
              queryKey: queryKeys.drivers(organisationId),
            });
          }}
        />
      ) : null}

      {organisationId ? (
        <DriverVehicleAssignDialog
          open={Boolean(assignDriver)}
          onOpenChange={(open) => !open && setAssignDriver(null)}
          organisationId={organisationId}
          driver={assignDriver}
        />
      ) : null}
    </>
  );
}
