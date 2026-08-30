"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isStripeConfigured } from "@/lib/env";
import {
  assignOrganisationPlan,
  listAllPlans,
  listSubscriptions,
} from "@/services/subscriptions.service";
import { getErrorMessage } from "@/utils/errors";

type SubRow = Awaited<ReturnType<typeof listSubscriptions>>[number];

export function SubscriptionsPage() {
  const { can, isPlatformOwner } = useOrg();
  const queryClient = useQueryClient();
  const canView = can("subscriptions:view");
  const canManage = can("subscriptions:manage") && isPlatformOwner;
  const [assigning, setAssigning] = useState<Record<string, string>>({});

  const subsQuery = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listSubscriptions,
    enabled: canView,
  });

  const plansQuery = useQuery({
    queryKey: ["plans", "all"],
    queryFn: listAllPlans,
    enabled: canManage,
  });

  const assignMutation = useMutation({
    mutationFn: ({
      organisationId,
      planId,
    }: {
      organisationId: string;
      planId: string;
    }) => assignOrganisationPlan(organisationId, planId),
    onSuccess: async () => {
      toast.success("Plan assigned");
      await queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  async function startCheckout(organisationId: string, planId: string) {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId, planId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function openPortal(organisationId: string) {
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Portal failed");
      window.location.href = data.url;
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const columns = useMemo<ColumnDef<SubRow, unknown>[]>(
    () => [
      {
        id: "org",
        header: "Organisation",
        cell: ({ row }) =>
          row.original.organisations?.name ??
          row.original.organisation_id.slice(0, 8),
      },
      {
        id: "plan",
        header: "Plan",
        cell: ({ row }) => row.original.plans?.name ?? "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const sub = row.original;
          if (!canManage) return null;
          const selected =
            assigning[sub.organisation_id] ?? sub.plan_id;
          return (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Select
                value={selected}
                onValueChange={(value) =>
                  setAssigning((prev) => ({
                    ...prev,
                    [sub.organisation_id]: value ?? "",
                  }))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  {(plansQuery.data ?? []).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={assignMutation.isPending}
                onClick={() =>
                  assignMutation.mutate({
                    organisationId: sub.organisation_id,
                    planId: selected,
                  })
                }
              >
                Assign
              </Button>
              {isStripeConfigured() &&
              plansQuery.data?.find((p) => p.id === selected)
                ?.stripe_price_id ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void startCheckout(sub.organisation_id, selected)
                  }
                >
                  Checkout
                </Button>
              ) : null}
              {sub.stripe_customer_id ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void openPortal(sub.organisation_id)}
                >
                  Portal
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [assignMutation, assigning, canManage, plansQuery.data]
  );

  if (!canView) {
    return (
      <EmptyState
        title="No access"
        description="Platform owners manage organisation subscriptions."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Assign plans and module entitlements. Stripe Checkout is optional when price IDs are set."
      />
      {subsQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <DataTable
          columns={columns}
          data={subsQuery.data ?? []}
          emptyMessage="No subscriptions yet. Apply migration 00013 and refresh."
        />
      )}
    </div>
  );
}
