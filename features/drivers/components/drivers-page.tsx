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
import { SelectField, TextAreaField, TextField, CheckboxField } from "@/components/forms/form-fields";
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
      license_code: initial?.license_code ?? "",
      license_expiry: initial?.license_expiry ?? "",
      pdp_number: initial?.pdp_number ?? "",
      pdp_expiry: initial?.pdp_expiry ?? "",
      tour_guide: initial?.tour_guide ?? false,
      additional_qualifications: initial?.additional_qualifications ?? "",
      profile_id: initial?.profile_id ?? "",
      status: initial?.status ?? "active",
    },
  });

  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          full_name: values.full_name.trim(),
          email: emptyToNull(values.email),
          phone: emptyToNull(values.phone),
          license_number: emptyToNull(values.license_number),
          license_code: emptyToNull(values.license_code),
          license_expiry: emptyToNull(values.license_expiry),
          pdp_number: emptyToNull(values.pdp_number),
          pdp_expiry: emptyToNull(values.pdp_expiry),
          tour_guide: values.tour_guide,
          additional_qualifications: emptyToNull(
            values.additional_qualifications
          ),
          profile_id: emptyToNull(values.profile_id),
          status: values.status,
        })
      )}
    >
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Profile</h3>
        <TextField control={form.control} name="full_name" label="Full name" />
        <TextField control={form.control} name="email" label="Email" type="email" />
        <TextField control={form.control} name="phone" label="Phone" />
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
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Driver’s licence</h3>
        <TextField
          control={form.control}
          name="license_number"
          label="Licence number"
        />
        <TextField
          control={form.control}
          name="license_code"
          label="Licence code"
          placeholder="e.g. EB, C1"
        />
        <TextField
          control={form.control}
          name="license_expiry"
          label="Licence expiry"
          type="date"
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Professional Driving Permit</h3>
        <TextField
          control={form.control}
          name="pdp_number"
          label="PDP / PrDP number"
        />
        <TextField
          control={form.control}
          name="pdp_expiry"
          label="PDP expiry"
          type="date"
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Extra designations</h3>
        <CheckboxField
          control={form.control}
          name="tour_guide"
          label="Tour guide"
          description="This driver is designated as a tour guide."
        />
        <TextAreaField
          control={form.control}
          name="additional_qualifications"
          label="Other qualifications"
          placeholder="First aid, dangerous goods, …"
        />
      </section>

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
      {
        accessorKey: "license_number",
        header: "Licence",
        cell: ({ row }) => row.original.license_number || "—",
      },
      {
        accessorKey: "pdp_number",
        header: "PDP",
        cell: ({ row }) => row.original.pdp_number || "—",
      },
      {
        id: "tour_guide",
        header: "Tour guide",
        cell: ({ row }) => (row.original.tour_guide ? "Yes" : "No"),
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
    []
  );

  return (
    <>
      <EntityCrudPage<Driver>
        title="Drivers"
        description="Driver profiles with licence, PDP, and extra designations such as tour guide."
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
            row.pdp_number,
            row.license_code,
            row.profiles?.email,
            row.profiles?.full_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        }
        emptyIcon={CircleUser}
        formDialogClassName="max-h-[90vh] overflow-y-auto sm:max-w-lg"
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
            { key: "license_number", label: "Licence number" },
            { key: "license_code", label: "Licence code" },
            { key: "license_expiry", label: "Licence expiry" },
            { key: "pdp_number", label: "PDP number" },
            { key: "pdp_expiry", label: "PDP expiry" },
            { key: "tour_guide", label: "Tour guide" },
            { key: "additional_qualifications", label: "Other qualifications" },
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
                license_expiry: row.license_expiry || null,
                pdp_number: row.pdp_number || null,
                pdp_expiry: row.pdp_expiry || null,
                tour_guide: row.tour_guide,
                additional_qualifications:
                  row.additional_qualifications || null,
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
