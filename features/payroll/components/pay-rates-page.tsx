"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Wallet } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { Button } from "@/components/ui/button";
import {
  payRateSchema,
  type PayRateValues,
} from "@/features/payroll/schemas/payroll";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import {
  PAY_RATE_UNIT_LABELS,
  PAY_RATE_UNITS,
  PAY_SUBJECT_ROLE_LABELS,
  PAY_SUBJECT_ROLES,
} from "@/lib/constants";
import {
  createPayRate,
  deletePayRate,
  listPayRates,
  updatePayRate,
  type PayRateInput,
} from "@/services/pay-rates.service";
import type { PayRate } from "@/types";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

const NONE = "none";

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NONE) return null;
  return trimmed;
}

function PayRateForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: PayRate;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { companies } = useEntityOptions(organisationId);
  const form = useForm<PayRateValues>({
    resolver: zodResolver(payRateSchema),
    defaultValues: {
      name: initial?.name ?? "",
      subject_role: initial?.subject_role ?? "driver",
      unit: initial?.unit ?? "trip",
      unit_amount: initial ? String(initial.unit_amount) : "",
      company_id: initial?.company_id ?? NONE,
      effective_from:
        initial?.effective_from ?? new Date().toISOString().slice(0, 10),
      effective_to: initial?.effective_to ?? "",
      notes: initial?.notes ?? "",
      currency: initial?.currency ?? "ZAR",
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        const unit_amount = Number(values.unit_amount);
        if (Number.isNaN(unit_amount) || unit_amount < 0) return;
        onSubmit({
          name: values.name.trim(),
          subject_role: values.subject_role,
          unit: values.unit,
          unit_amount,
          currency: values.currency || "ZAR",
          company_id: emptyToNull(values.company_id),
          effective_from: values.effective_from,
          effective_to: emptyToNull(values.effective_to),
          notes: values.notes?.trim() || null,
        });
      })}
    >
      <TextField control={form.control} name="name" label="Name" />
      <SelectField
        control={form.control}
        name="subject_role"
        label="Subject"
        options={PAY_SUBJECT_ROLES.map((r) => ({
          value: r,
          label: PAY_SUBJECT_ROLE_LABELS[r],
        }))}
      />
      <SelectField
        control={form.control}
        name="unit"
        label="Unit"
        options={PAY_RATE_UNITS.map((u) => ({
          value: u,
          label: PAY_RATE_UNIT_LABELS[u],
        }))}
      />
      <TextField
        control={form.control}
        name="unit_amount"
        label="Unit amount"
        type="number"
      />
      <SelectField
        control={form.control}
        name="company_id"
        label="Company (optional)"
        options={[{ value: NONE, label: "All companies" }, ...companies]}
      />
      <TextField
        control={form.control}
        name="effective_from"
        label="Effective from"
        type="date"
      />
      <TextField
        control={form.control}
        name="effective_to"
        label="Effective to (optional)"
        type="date"
      />
      <TextField control={form.control} name="notes" label="Notes" />
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Saving…" : "Save pay rate"}
      </Button>
    </form>
  );
}

export function PayRatesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("payroll:view");
  const canManage = can("payroll:manage");

  const columns = useMemo<ColumnDef<PayRate, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) =>
          PAY_SUBJECT_ROLE_LABELS[row.original.subject_role] ??
          row.original.subject_role,
      },
      {
        id: "unit",
        header: "Unit",
        cell: ({ row }) =>
          PAY_RATE_UNIT_LABELS[row.original.unit] ?? row.original.unit,
      },
      {
        id: "company",
        header: "Company",
        cell: ({ row }) =>
          row.original.companies?.name ??
          (row.original.company_id ? row.original.company_id.slice(0, 8) : "All"),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) =>
          `${row.original.currency} ${row.original.unit_amount}`,
      },
      {
        id: "effective",
        header: "Effective",
        cell: ({ row }) =>
          `${formatDate(row.original.effective_from)}${
            row.original.effective_to
              ? ` → ${formatDate(row.original.effective_to)}`
              : ""
          }`,
      },
    ],
    []
  );

  if (!canView) {
    return (
      <EmptyState
        title="No access"
        description="You do not have permission to view pay rates."
      />
    );
  }

  return (
    <EntityCrudPage<PayRate>
      title="Pay rates"
      description="Driver trip and employee boarding rates used by payroll runs."
      organisationId={organisationId}
      queryKey={
        organisationId ? queryKeys.payRates(organisationId) : ["pay-rates", "none"]
      }
      columns={columns}
      list={listPayRates}
      create={
        canManage
          ? (orgId, values) => createPayRate(orgId, values as PayRateInput)
          : undefined
      }
      update={
        canManage
          ? (id, values) => updatePayRate(id, values as Partial<PayRateInput>)
          : undefined
      }
      remove={canManage ? deletePayRate : undefined}
      canManage={canManage}
      searchFilter={(row, query) => row.name.toLowerCase().includes(query)}
      emptyIcon={Wallet}
      createLabel="Add pay rate"
      renderForm={({ initial, onSubmit, submitting }) => (
        <PayRateForm
          key={initial?.id ?? "create"}
          organisationId={organisationId}
          initial={initial}
          onSubmit={onSubmit}
          submitting={submitting}
        />
      )}
    />
  );
}
