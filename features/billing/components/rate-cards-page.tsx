"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Tags } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

import { useOrg } from "@/components/layout/org-context";
import { SelectField, TextField } from "@/components/forms/form-fields";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityCrudPage } from "@/components/shared/entity-crud-page";
import { Button } from "@/components/ui/button";
import {
  rateCardSchema,
  type RateCardValues,
} from "@/features/billing/schemas/rate-card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import {
  INVOICE_LINE_TYPE_LABELS,
  RATE_CARD_LINE_TYPES,
  RATE_CARD_UNIT_LABELS,
  RATE_CARD_UNITS,
} from "@/lib/constants";
import {
  createRateCard,
  deleteRateCard,
  listRateCards,
  updateRateCard,
  type RateCardInput,
} from "@/services/rate-cards.service";
import type { RateCard } from "@/types";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

const NONE = "none";

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === NONE) return null;
  return trimmed;
}

function RateCardForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: RateCard;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { companies } = useEntityOptions(organisationId);
  const form = useForm<RateCardValues>({
    resolver: zodResolver(rateCardSchema),
    defaultValues: {
      name: initial?.name ?? "",
      line_type: initial?.line_type ?? "trip",
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
          line_type: values.line_type,
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
        name="line_type"
        label="Line type"
        options={RATE_CARD_LINE_TYPES.map((t) => ({
          value: t,
          label: INVOICE_LINE_TYPE_LABELS[t],
        }))}
      />
      <SelectField
        control={form.control}
        name="unit"
        label="Unit"
        options={RATE_CARD_UNITS.map((u) => ({
          value: u,
          label: RATE_CARD_UNIT_LABELS[u],
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
        {submitting ? "Saving…" : "Save rate card"}
      </Button>
    </form>
  );
}

export function RateCardsPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("rate_cards:view");
  const canManage = can("rate_cards:manage");

  const columns = useMemo<ColumnDef<RateCard, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Name" },
      {
        id: "company",
        header: "Company",
        cell: ({ row }) =>
          row.original.companies?.name ??
          (row.original.company_id ? row.original.company_id.slice(0, 8) : "All"),
      },
      {
        id: "line_type",
        header: "Type",
        cell: ({ row }) =>
          INVOICE_LINE_TYPE_LABELS[row.original.line_type] ??
          row.original.line_type,
      },
      {
        id: "unit",
        header: "Unit",
        cell: ({ row }) =>
          RATE_CARD_UNIT_LABELS[row.original.unit] ?? row.original.unit,
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
      <div>
        <EmptyState
          title="No access"
          description="You do not have permission to view rate cards."
        />
      </div>
    );
  }

  return (
    <EntityCrudPage<RateCard>
      title="Rate cards"
      description="Pricing for trip, fixed, and adjustment invoice lines."
      organisationId={organisationId}
      queryKey={
        organisationId
          ? queryKeys.rateCards(organisationId)
          : ["rate-cards", "none"]
      }
      columns={columns}
      list={listRateCards}
      create={
        canManage
          ? (orgId, values) => createRateCard(orgId, values as RateCardInput)
          : undefined
      }
      update={
        canManage
          ? (id, values) => updateRateCard(id, values as Partial<RateCardInput>)
          : undefined
      }
      remove={canManage ? deleteRateCard : undefined}
      canManage={canManage}
      searchFilter={(row, query) => row.name.toLowerCase().includes(query)}
      emptyIcon={Tags}
      createLabel="Add rate card"
      renderForm={({ initial, onSubmit, submitting }) => (
        <RateCardForm
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
