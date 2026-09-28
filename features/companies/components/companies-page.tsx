"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { StatusBadge } from "@/components/shared/status-badge";
import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  defaultEffectiveFromDate,
  latestTripRateCard,
} from "@/features/companies/lib/company-trip-rate";
import {
  companySchema,
  type CompanyValues,
} from "@/features/companies/schemas/company";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { ENTITY_STATUSES, STATUS_LABELS } from "@/lib/constants";
import {
  createCompanyWithOptionalTripRate,
  deleteCompany,
  listCompanies,
  listCompanyTripRateCards,
  restoreCompany,
  updateCompanyWithOptionalTripRate,
  type CompanyTripRateInput,
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

function parseTripRate(values: CompanyValues): CompanyTripRateInput | null {
  const raw = values.default_trip_rate_zar?.trim();
  if (!raw) return null;
  const amount = Number.parseFloat(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    unitAmount: amount,
    effectiveFrom: values.trip_rate_effective_from?.trim() || defaultEffectiveFromDate(),
  };
}

function CompanyForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string;
  initial?: Company;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const ratesQuery = useQuery({
    queryKey: ["company-trip-rates", organisationId, initial?.id],
    queryFn: () => listCompanyTripRateCards(organisationId, initial!.id),
    enabled: Boolean(initial?.id),
  });

  const latestRate = useMemo(
    () => latestTripRateCard(ratesQuery.data ?? []),
    [ratesQuery.data]
  );

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
      default_trip_rate_zar: "",
      trip_rate_effective_from: defaultEffectiveFromDate(),
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        const tripRate = parseTripRate(values);
        onSubmit({
          company: {
            name: values.name.trim(),
            code: emptyToNull(values.code),
            contact_name: emptyToNull(values.contact_name),
            contact_email: emptyToNull(values.contact_email),
            contact_phone: emptyToNull(values.contact_phone),
            address: emptyToNull(values.address),
            status: values.status,
          },
          tripRate,
        });
      })}
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

      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div>
          <p className="text-sm font-medium">Default trip rate (ZAR)</p>
          <p className="text-xs text-muted-foreground">
            Saved as a rate card (effective-dated). Changing the rate here creates a new
            rate card row; older invoice lines keep their original amounts.
          </p>
          {initial && latestRate ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Current trip rate: ZAR {Number(latestRate.unit_amount).toFixed(2)} effective{" "}
              {latestRate.effective_from}
            </p>
          ) : null}
        </div>
        <TextField
          control={form.control}
          name="default_trip_rate_zar"
          label="Trip rate (ZAR)"
          type="number"
          placeholder={initial ? "Leave blank to keep current rate" : "e.g. 300"}
        />
        <TextField
          control={form.control}
          name="trip_rate_effective_from"
          label="Rate effective from"
          type="date"
        />
      </div>

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
        canManage && organisationId
          ? async (_orgId, values) => {
              const payload = values as {
                company: Parameters<typeof createCompanyWithOptionalTripRate>[1];
                tripRate: CompanyTripRateInput | null;
              };
              return createCompanyWithOptionalTripRate(
                organisationId,
                payload.company,
                payload.tripRate
              );
            }
          : undefined
      }
      update={
        canManage && organisationId
          ? async (id, values) => {
              const payload = values as {
                company: Partial<Parameters<typeof createCompanyWithOptionalTripRate>[1]>;
                tripRate: CompanyTripRateInput | null;
              };
              return updateCompanyWithOptionalTripRate(
                id,
                organisationId,
                payload.company,
                payload.tripRate
              );
            }
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
      renderForm={({ initial, onSubmit, submitting }) =>
        organisationId ? (
          <CompanyForm
            key={initial?.id ?? "create"}
            organisationId={organisationId}
            initial={initial}
            onSubmit={onSubmit}
            submitting={submitting}
          />
        ) : null
      }
    />
  );
}
