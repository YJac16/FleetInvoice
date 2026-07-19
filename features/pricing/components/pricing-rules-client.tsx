"use client";

import { useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PricePreviewPanel } from "@/features/pricing/components/price-preview-panel";
import { PricingRuleForm } from "@/features/pricing/components/pricing-rule-form";
import type { PricingRuleFormValues } from "@/features/pricing/schemas";
import { formatRuleLabel } from "@/lib/pricing/engine";
import {
  createPricingRule,
  deletePricingRule,
  updatePricingRule,
} from "@/services/pricing.service";
import type { PricingRuleWithDetails } from "@/types/database";
import { formatRand } from "@/utils/currency";

interface PricingRulesClientProps {
  rules: PricingRuleWithDetails[];
  companies: { id: string; company_name: string }[];
  areas: { id: string; name: string }[];
  vehicles: { id: string; label: string }[];
  areaNames: string[];
}

export function PricingRulesClient({
  rules: initialRules,
  companies,
  areas,
  vehicles,
  areaNames,
}: PricingRulesClientProps) {
  const [rules, setRules] = useState(initialRules);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PricingRuleWithDetails | null>(null);
  const [deleting, setDeleting] = useState<PricingRuleWithDetails | null>(null);
  const [pending, startTransition] = useTransition();

  const columns = useMemo<ColumnDef<PricingRuleWithDetails>[]>(
    () => [
      {
        accessorKey: "company_name",
        header: "Company",
      },
      {
        accessorKey: "pickup_area_name",
        header: "Pickup",
      },
      {
        accessorKey: "destination_area_name",
        header: "Destination",
      },
      {
        id: "areas",
        header: "Areas",
        cell: ({ row }) =>
          row.original.areas_visited_names.length > 0
            ? row.original.areas_visited_names.join(", ")
            : "Any",
      },
      {
        id: "passengers",
        header: "Passenger range",
        cell: ({ row }) =>
          `${row.original.minimum_passengers}–${row.original.maximum_passengers}`,
      },
      {
        accessorKey: "vehicle_label",
        header: "Vehicle",
      },
      {
        id: "price",
        header: "Price",
        cell: ({ row }) => formatRand(row.original.price),
      },
      {
        accessorKey: "priority",
        header: "Priority",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.active ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(row.original)}
            >
              <Pencil className="size-4" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!row.original.active}
              onClick={() => setDeleting(row.original)}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Deactivate</span>
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  function handleCreate(values: PricingRuleFormValues) {
    startTransition(async () => {
      const result = await createPricingRule(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Created");
      setCreateOpen(false);
      // Optimistic refresh via reload for enriched labels
      window.location.reload();
    });
  }

  function handleEdit(values: PricingRuleFormValues) {
    if (!editing) return;
    startTransition(async () => {
      const result = await updatePricingRule(editing.id, values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Updated");
      setEditing(null);
      window.location.reload();
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deletePricingRule(deleting.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Deactivated");
      setRules((prev) =>
        prev.map((rule) =>
          rule.id === deleting.id ? { ...rule, active: false } : rule
        )
      );
      setDeleting(null);
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pricing Rules"
        description="Server-side pricing for trips. Drivers never see prices or these rules. Edits only affect future trips."
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create rule
          </Button>
        }
      />

      {rules.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No pricing rules"
          description="Create a rule so pending trips can calculate a hidden price automatically."
        />
      ) : (
        <DataTable
          columns={columns}
          data={rules}
          emptyMessage="No pricing rules match."
        />
      )}

      <PricePreviewPanel
        companies={companies}
        areaNames={areaNames}
        vehicles={vehicles}
      />

      <Modal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create pricing rule"
        description="Highest priority matching rule wins. Leave areas visited empty to match any set."
        className="max-w-2xl"
      >
        <PricingRuleForm
          companies={companies}
          areas={areas}
          vehicles={vehicles}
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreate}
          submitting={pending}
          submitLabel="Create rule"
        />
      </Modal>

      <Modal
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={
          editing
            ? `Edit ${formatRuleLabel(editing.id)}`
            : "Edit pricing rule"
        }
        description="Changes only affect future trips. Previously calculated trips remain unchanged."
        className="max-w-2xl"
      >
        {editing ? (
          <PricingRuleForm
            companies={companies}
            areas={areas}
            vehicles={vehicles}
            defaultValues={{
              companyId: editing.company_id,
              pickupAreaId: editing.pickup_area_id,
              destinationAreaId: editing.destination_area_id,
              areasVisited: editing.areas_visited,
              minimumPassengers: editing.minimum_passengers,
              maximumPassengers: editing.maximum_passengers,
              vehicleId: editing.vehicle_id ?? "",
              price: Number(editing.price),
              priority: editing.priority,
              active: editing.active,
              ruleName: editing.rule_name,
            }}
            onCancel={() => setEditing(null)}
            onSubmit={handleEdit}
            submitting={pending}
            submitLabel="Save changes"
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Deactivate pricing rule?"
        description="This soft-deletes the rule. It will no longer match new trips. Existing trip prices are kept."
        confirmLabel="Deactivate"
        variant="destructive"
        loading={pending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
