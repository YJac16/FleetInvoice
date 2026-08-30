"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2 } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  companySchema,
  type CompanyValues,
} from "@/features/companies/schemas/company";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createCompany,
  deleteCompany,
  listCompanies,
  restoreCompany,
  updateCompany,
} from "@/services/companies.service";
import type { Company } from "@/types";
import { queryKeys } from "@/utils/query";

const statusOptions = ENTITY_STATUSES.map((status) => ({
  label: STATUS_LABELS[status],
  value: status,
}));

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function CompanyForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Company;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const form = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      contact_name: initial?.contact_name ?? "",
      contact_email: initial?.contact_email ?? "",
      contact_phone: initial?.contact_phone ?? "",
      address: initial?.address ?? "",
      status: initial?.status ?? "active",
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          code: emptyToNull(values.code),
          contact_name: emptyToNull(values.contact_name),
          contact_email: emptyToNull(values.contact_email),
          contact_phone: emptyToNull(values.contact_phone),
          address: emptyToNull(values.address),
          status: values.status,
        })
      )}
    >
      <TextField control={form.control} name="name" label="Name" />
      <TextField control={form.control} name="code" label="Code" />
      <TextField control={form.control} name="contact_name" label="Contact name" />
      <TextField
        control={form.control}
        name="contact_email"
        label="Contact email"
        type="email"
      />
      <TextField
        control={form.control}
        name="contact_phone"
        label="Contact phone"
      />
      <TextAreaField control={form.control} name="address" label="Address" />
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

export function CompaniesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canManage = can("companies:manage");

  const columns = useMemo<ColumnDef<Company, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "code", header: "Code" },
      { accessorKey: "contact_name", header: "Contact" },
      { accessorKey: "contact_email", header: "Email" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    []
  );

  return (
    <EntityCrudPage<Company>
      title="Companies"
      description="Manage client companies for the active organisation."
      organisationId={organisationId}
      queryKey={
        organisationId
          ? queryKeys.companies(organisationId)
          : ["companies", "none"]
      }
      columns={columns}
      list={listCompanies}
      create={
        canManage
          ? (orgId, values) =>
              createCompany(orgId, values as Parameters<typeof createCompany>[1])
          : undefined
      }
      update={
        canManage
          ? (id, values) =>
              updateCompany(id, values as Parameters<typeof updateCompany>[1])
          : undefined
      }
      remove={canManage ? deleteCompany : undefined}
      restore={canManage ? restoreCompany : undefined}
      canManage={canManage}
      searchFilter={(row, query) =>
        [row.name, row.code, row.contact_name, row.contact_email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      }
      emptyIcon={Building2}
      createLabel="Add company"
      renderForm={({ initial, onSubmit, submitting }) => (
        <CompanyForm
          key={initial?.id ?? "create"}
          initial={initial}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      )}
    />
  );
}
