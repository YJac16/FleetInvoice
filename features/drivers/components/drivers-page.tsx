"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CircleUser, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
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
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createDriver,
  createDriversBulk,
  deleteDriver,
  listDrivers,
  restoreDriver,
  updateDriver,
} from "@/services/drivers.service";
import { listMembers } from "@/services/users.service";
import type { Driver } from "@/types";
import { queryKeys } from "@/utils/query";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
      profile_id: initial?.profile_id ?? "",
      status: initial?.status ?? "active",
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

  const columns = useMemo<ColumnDef<Driver, unknown>[]>(
    () => [
      { accessorKey: "full_name", header: "Name" },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "license_number", header: "License" },
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
    []
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
                status: row.status,
              }))
            );
            await queryClient.invalidateQueries({
              queryKey: queryKeys.drivers(organisationId),
            });
          }}
        />
      ) : null}
    </>
  );
}
