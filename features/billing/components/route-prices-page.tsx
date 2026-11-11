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
import { BusyButton } from "@/components/admin/busy-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  placeLines,
  placesToText,
  ROUTE_PRICE_MATCH_KINDS,
  ROUTE_PRICE_MATCH_LABELS,
  routePriceSchema,
  type RoutePriceFormValues,
} from "@/features/billing/schemas/route-price";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { useEntityOptions } from "@/hooks/use-entity-options";
import {
  archiveRoutePrice,
  createRoutePrice,
  listRoutePrices,
  restoreRoutePrice,
  updateRoutePrice,
  type RoutePriceInput,
} from "@/services/route-prices.service";
import type { RoutePrice } from "@/types";
import { queryKeys } from "@/utils/query";

function RoutePriceForm({
  organisationId,
  initial,
  onSubmit,
  submitting,
}: {
  organisationId: string | null;
  initial?: RoutePrice;
  onSubmit: (values: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const { companies } = useEntityOptions(organisationId);
  const form = useForm<RoutePriceFormValues>({
    resolver: zodResolver(routePriceSchema),
    defaultValues: {
      company_id: initial?.company_id ?? "",
      label: initial?.label ?? "",
      match_kind: initial?.match_kind ?? "exact",
      stops_text: placesToText(initial?.stops),
      anchor_place: initial?.anchor_place ?? "",
      places_text: placesToText(initial?.places),
      bidirectional: initial?.bidirectional ?? true,
      unit_amount: initial ? String(initial.unit_amount) : "",
      priority: initial ? String(initial.priority) : "0",
      notes: initial?.notes ?? "",
      active: initial?.active ?? true,
    },
  });
  const matchKind = form.watch("match_kind");

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        const priority = Number(values.priority || "0");
        onSubmit({
          company_id: values.company_id,
          label: values.label.trim(),
          match_kind: values.match_kind,
          stops: values.match_kind === "exact" ? placeLines(values.stops_text) : [],
          anchor_place:
            values.match_kind === "anchor" ? values.anchor_place?.trim() || null : null,
          places:
            values.match_kind === "exact" || values.match_kind === "company"
              ? []
              : placeLines(values.places_text),
          bidirectional:
            values.match_kind === "exact" || values.match_kind === "anchor"
              ? values.bidirectional
              : true,
          unit_amount: Number(values.unit_amount),
          priority: Number.isFinite(priority) ? priority : 0,
          notes: values.notes?.trim() || null,
          active: values.active,
          currency: "ZAR",
        });
      })}
    >
      <SelectField
        control={form.control}
        name="company_id"
        label="Company"
        options={companies}
        placeholder="Select company"
      />
      <TextField control={form.control} name="label" label="Label" />
      <SelectField
        control={form.control}
        name="match_kind"
        label="How this route matches"
        options={ROUTE_PRICE_MATCH_KINDS.map((kind) => ({
          value: kind,
          label: ROUTE_PRICE_MATCH_LABELS[kind],
        }))}
      />
      {matchKind === "exact" ? (
        <div className="space-y-1.5">
          <Label htmlFor="route-stops">Stops, in order</Label>
          <Textarea
            id="route-stops"
            rows={4}
            placeholder={"Airport\nCrystal Towers"}
            {...form.register("stops_text")}
          />
          <p className="text-xs text-muted-foreground">
            One place per line. Pickup first, drop-off last. Add a middle stop for a via route.
          </p>
          {form.formState.errors.stops_text ? (
            <p className="text-xs text-destructive">{form.formState.errors.stops_text.message}</p>
          ) : null}
        </div>
      ) : null}
      {matchKind === "anchor" ? (
        <TextField
          control={form.control}
          name="anchor_place"
          label="Fixed end"
          placeholder="Airport"
        />
      ) : null}
      {matchKind === "anchor" || matchKind === "within" || matchKind === "either" ? (
        <div className="space-y-1.5">
          <Label htmlFor="route-places">
            {matchKind === "anchor" ? "Other end is one of" : "Places"}
          </Label>
          <Textarea
            id="route-places"
            rows={4}
            placeholder={"Cullinan\nProtea Sea Point"}
            {...form.register("places_text")}
          />
          {form.formState.errors.places_text ? (
            <p className="text-xs text-destructive">{form.formState.errors.places_text.message}</p>
          ) : null}
        </div>
      ) : null}
      {matchKind === "exact" || matchKind === "anchor" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register("bidirectional")} />
          Both directions
        </label>
      ) : null}
      <TextField control={form.control} name="unit_amount" label="Price (R)" type="number" />
      <TextField
        control={form.control}
        name="priority"
        label="Tie-break priority"
        type="number"
      />
      <p className="text-xs text-muted-foreground">
        An exact route beats a fixed end, which beats an area, which beats either end, which beats
        a company flat. Priority only breaks a tie between two rules of the same kind.
      </p>
      <TextField control={form.control} name="notes" label="Notes" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("active")} />
        Active
      </label>
      <BusyButton type="submit" className="w-full" pending={submitting} pendingLabel="Saving…">
        Save route price
      </BusyButton>
    </form>
  );
}

export function RoutePricesPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("rate_cards:view");
  const canManage = can("rate_cards:manage");

  const columns = useMemo<ColumnDef<RoutePrice, unknown>[]>(
    () => [
      { accessorKey: "label", header: "Route" },
      {
        id: "company",
        header: "Company",
        cell: ({ row }) => row.original.companies?.name ?? "—",
      },
      {
        id: "match",
        header: "Match",
        cell: ({ row }) => ROUTE_PRICE_MATCH_LABELS[row.original.match_kind],
      },
      {
        id: "amount",
        header: "Price",
        cell: ({ row }) => `R ${Number(row.original.unit_amount).toFixed(2)}`,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (row.original.active ? "Yes" : "No"),
      },
    ],
    []
  );

  if (!canView) {
    return (
      <EmptyState
        title="No access"
        description="You do not have permission to view route prices."
      />
    );
  }

  return (
    <EntityCrudPage<RoutePrice>
      title="Route prices"
      description="Default prices by route. A new trip, or a trip whose route changes, starts from the matching default. If none matches, the company rate card is used. Anyone entering the trip can change the price for that line."
      organisationId={organisationId}
      queryKey={
        organisationId ? queryKeys.routePrices(organisationId) : ["route-prices", "none"]
      }
      columns={columns}
      list={listRoutePrices}
      create={
        canManage
          ? (orgId, values) => createRoutePrice(orgId, values as RoutePriceInput)
          : undefined
      }
      update={
        canManage
          ? (id, values) => updateRoutePrice(id, values as Partial<RoutePriceInput>)
          : undefined
      }
      remove={canManage ? archiveRoutePrice : undefined}
      restore={canManage ? restoreRoutePrice : undefined}
      canManage={canManage}
      searchFilter={(row, query) => {
        const haystack = `${row.label} ${row.companies?.name ?? ""}`.toLowerCase();
        return haystack.includes(query);
      }}
      emptyIcon={Tags}
      createLabel="Add route price"
      renderForm={({ initial, onSubmit, submitting }) => (
        <RoutePriceForm
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
