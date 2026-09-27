"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleUser, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { ComplianceDocumentSection } from "@/features/compliance/components/compliance-document-section";
import { ComplianceExpiryBadge } from "@/features/compliance/components/compliance-expiry-badge";
import { LICENSE_CODES } from "@/features/compliance/lib/compliance-status";
import { PRDP_SHORT_LABEL } from "@/features/compliance/lib/prdp-label";
import { DriverVehicleAssignDialog } from "@/features/drivers/components/driver-vehicle-assign-dialog";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/features/import/components/csv-import-dialog";
import { driverImportSchema } from "@/features/import/schemas/import-schemas";
import {
  driverSchema,
  type DriverValues,
} from "@/features/drivers/schemas/driver";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { createClient } from "@/lib/supabase/client";
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

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

const licenseCodeOptions = [
  { label: "Not set", value: "" },
  ...LICENSE_CODES.map((code) => ({ label: code, value: code })),
];

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function DriverForm({
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

  const profileOptions = useMemo(() => {
    const options = [{ label: "None", value: "" }];
    for (const member of membersQuery.data ?? []) {
      const profile = member.profiles;
      if (!profile) continue;
      options.push({
        value: profile.id,
        label:
          profile.full_name ||
          profile.email ||
          profile.id.slice(0, 8),
      });
    }
    return options;
  }, [membersQuery.data]);

  const form = useForm<DriverValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      full_name: initial?.full_name ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      license_number: initial?.license_number ?? "",
      license_code: (initial?.license_code as DriverValues["license_code"]) ?? "",
      license_code_other: initial?.license_code_other ?? "",
      license_expires_on: toDateInput(initial?.license_expires_on),
      pdp_number: initial?.pdp_number ?? "",
      pdp_expires_on: toDateInput(initial?.pdp_expires_on),
      profile_id: initial?.profile_id ?? "",
      status: initial?.status ?? "active",
    },
  });

  const licenseCode = useWatch({ control: form.control, name: "license_code" });

  const scanEnabledQuery = useQuery({
    queryKey: [...queryKeys.organisation(organisationId), "compliance-scan"],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("organisations")
        .select("compliance_scan_enabled")
        .eq("id", organisationId)
        .maybeSingle();
      return data?.compliance_scan_enabled === true;
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          full_name: values.full_name.trim(),
          email: emptyToNull(values.email),
          phone: emptyToNull(values.phone),
          license_number: emptyToNull(values.license_number),
          license_code: emptyToNull(values.license_code),
          license_code_other:
            values.license_code === "Other"
              ? emptyToNull(values.license_code_other)
              : null,
          license_expires_on: emptyToNull(values.license_expires_on),
          pdp_number: emptyToNull(values.pdp_number),
          pdp_expires_on: emptyToNull(values.pdp_expires_on),
          profile_id: emptyToNull(values.profile_id),
          status: values.status,
        })
      )}
    >
      <TextField control={form.control} name="full_name" label="Full name" />
      <TextField control={form.control} name="email" label="Email" type="email" />
      <TextField control={form.control} name="phone" label="Phone" />
      <TextField
        control={form.control}
        name="license_number"
        label="License number"
      />
      <SelectField
        control={form.control}
        name="license_code"
        label="Licence code"
        options={licenseCodeOptions}
        placeholder="Optional"
      />
      {licenseCode === "Other" ? (
        <TextField
          control={form.control}
          name="license_code_other"
          label="Explain licence code"
        />
      ) : null}
      <TextField
        control={form.control}
        name="license_expires_on"
        label="Licence expires"
        type="date"
      />
      {initial?.id ? (
        <ComplianceDocumentSection
          subjectKind="driver"
          subjectId={initial.id}
          docType="driver_licence"
          label="Driver licence document"
          scanEnabled={scanEnabledQuery.data === true}
          onApplyScanFields={(values) => {
            for (const [key, value] of Object.entries(values)) {
              form.setValue(key as keyof DriverValues, value, { shouldDirty: true });
            }
          }}
        />
      ) : null}
      <TextField
        control={form.control}
        name="pdp_number"
        label={`${PRDP_SHORT_LABEL} number`}
      />
      <TextField
        control={form.control}
        name="pdp_expires_on"
        label={`${PRDP_SHORT_LABEL} expires`}
        type="date"
      />
      {initial?.id ? (
        <ComplianceDocumentSection
          subjectKind="driver"
          subjectId={initial.id}
          docType="prdp"
          label={`${PRDP_SHORT_LABEL} document`}
          scanEnabled={scanEnabledQuery.data === true}
          onApplyScanFields={(values) => {
            for (const [key, value] of Object.entries(values)) {
              form.setValue(key as keyof DriverValues, value, { shouldDirty: true });
            }
          }}
        />
      ) : null}
      <SelectField
        control={form.control}
        name="profile_id"
        label="Linked user profile"
        options={profileOptions}
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
        createLabel="Add driver"
        headerActions={
          canManage ? (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
          ) : null
        }
        rowActions={
          canManage
            ? (row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAssignDriver(row)}
                >
                  Vehicle
                </Button>
              )
            : undefined
        }
        renderForm={({ initial, onSubmit, submitting }) =>
          organisationId ? (
            <DriverForm
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
