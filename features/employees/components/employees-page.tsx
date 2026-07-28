"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { UsersRound, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { CsvImportDialog } from "@/features/import/components/csv-import-dialog";
import { employeeImportSchema } from "@/features/import/schemas/import-schemas";
import {
  employeeSchema,
  type EmployeeValues,
} from "@/features/employees/schemas/employee";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createEmployee,
  createEmployeesBulk,
  deleteEmployee,
  listEmployees,
  restoreEmployee,
  updateEmployee,
} from "@/services/employees.service";
import { listCompanies } from "@/services/companies.service";
import { listMembers } from "@/services/users.service";
import type { Employee } from "@/types";
import { queryKeys } from "@/utils/query";

const NONE = "none";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NONE) return null;
  return trimmed;
}

function EmployeeForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: Employee;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { companies, sites } = useEntityOptions(organisationId);
  const membersQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.members(organisationId)
      : ["members", "none"],
    queryFn: () => listMembers(organisationId!),
    enabled: Boolean(organisationId),
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

  const form = useForm<EmployeeValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      full_name: initial?.full_name ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      employee_number: initial?.employee_number ?? "",
      company_id: initial?.company_id ?? NONE,
      site_id: initial?.site_id ?? NONE,
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
          employee_number: emptyToNull(values.employee_number),
          company_id: emptyToNull(values.company_id),
          site_id: emptyToNull(values.site_id),
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
        name="employee_number"
        label="Employee number"
      />
      <SelectField
        control={form.control}
        name="company_id"
        label="Company"
        options={[{ label: "None", value: NONE }, ...companies]}
      />
      <SelectField
        control={form.control}
        name="site_id"
        label="Site"
        options={[{ label: "None", value: NONE }, ...sites]}
      />
      <SelectField
        control={form.control}
        name="profile_id"
        label="Linked user profile"
        options={profileOptions}
        placeholder="Optional — required for employee portal"
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

export function EmployeesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("employees:manage");
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

  const columns = useMemo<ColumnDef<Employee, unknown>[]>(
    () => [
      { accessorKey: "full_name", header: "Name" },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "employee_number", header: "Employee #" },
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
      <EntityCrudPage<Employee>
        title="Employees"
        description="Manage employees for the active organisation."
        organisationId={organisationId}
        queryKey={
          organisationId
            ? queryKeys.employees(organisationId)
            : ["employees", "none"]
        }
        columns={columns}
        list={listEmployees}
        create={
          canManage
            ? (orgId, values) =>
                createEmployee(
                  orgId,
                  values as Parameters<typeof createEmployee>[1]
                )
            : undefined
        }
        update={
          canManage
            ? (id, values) =>
                updateEmployee(
                  id,
                  values as Parameters<typeof updateEmployee>[1]
                )
            : undefined
        }
        remove={canManage ? deleteEmployee : undefined}
        restore={canManage ? restoreEmployee : undefined}
        canManage={canManage}
        searchFilter={(row, query) =>
          [row.full_name, row.email, row.phone, row.employee_number]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        }
        emptyIcon={UsersRound}
        createLabel="Add employee"
        headerActions={
          canManage ? (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
          ) : null
        }
        renderForm={({ initial, onSubmit, submitting }) => (
          <EmployeeForm
            key={initial?.id ?? "create"}
            organisationId={organisationId}
            initial={initial}
            onSubmit={onSubmit}
            submitting={submitting}
          />
        )}
      />

      {organisationId ? (
        <CsvImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          title="Import employees"
          templateFilename="employees-template.csv"
          columns={[
            { key: "full_name", label: "Full name", required: true },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "employee_number", label: "Employee number" },
            { key: "company_code", label: "Company code" },
            { key: "status", label: "Status" },
          ]}
          schema={employeeImportSchema}
          onImport={async (rows) => {
            const companies = await listCompanies(organisationId);
            const byCode = new Map(
              companies
                .filter((c) => c.code)
                .map((c) => [c.code!.toLowerCase(), c.id])
            );
            await createEmployeesBulk(
              organisationId,
              rows.map((row) => ({
                full_name: row.full_name,
                email: row.email || null,
                phone: row.phone || null,
                employee_number: row.employee_number || null,
                company_id: row.company_code
                  ? byCode.get(row.company_code.toLowerCase()) ?? null
                  : null,
                status: row.status,
              }))
            );
            await queryClient.invalidateQueries({
              queryKey: queryKeys.employees(organisationId),
            });
          }}
        />
      ) : null}
    </>
  );
}
