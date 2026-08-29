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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlanCard } from "@/features/subscriptions/components/plan-card";
import { isStripeConfigured } from "@/lib/env";
import {
  formatZarFromCents,
  isRecommendedPlan,
  vehicleSoftCapCopy,
} from "@/lib/plans";
import {
  assignOrganisationPlan,
  countOrganisationVehicles,
  getOrganisationSubscription,
  listAllPlans,
  listPlansWithEntitlements,
  listSubscriptions,
} from "@/services/subscriptions.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

type SubRow = Awaited<ReturnType<typeof listSubscriptions>>[number];

export function SubscriptionsPage() {
  const { can, isPlatformOwner, activeOrganisationId } = useOrg();
  const queryClient = useQueryClient();
  const canView = can("subscriptions:view");
  const canManage = can("subscriptions:manage") && isPlatformOwner;
  const [assigning, setAssigning] = useState<Record<string, string>>({});

  const plansQuery = useQuery({
    queryKey: queryKeys.plans,
    queryFn: listPlansWithEntitlements,
    enabled: canView,
  });

  const currentQuery = useQuery({
    queryKey: activeOrganisationId
      ? queryKeys.organisationSubscription(activeOrganisationId)
      : ["subscription", "none"],
    queryFn: () => getOrganisationSubscription(activeOrganisationId!),
    enabled: canView && Boolean(activeOrganisationId),
  });

  const vehiclesQuery = useQuery({
    queryKey: activeOrganisationId
      ? queryKeys.organisationVehiclesCount(activeOrganisationId)
      : ["vehicles-count", "none"],
    queryFn: () => countOrganisationVehicles(activeOrganisationId!),
    enabled: canView && Boolean(activeOrganisationId),
  });

  const allPlansQuery = useQuery({
    queryKey: ["plans", "all"],
    queryFn: listAllPlans,
    enabled: canManage,
  });

  const subsQuery = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listSubscriptions,
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
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["entitlements"] });
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
          const selected = assigning[sub.organisation_id] ?? sub.plan_id;
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
                  {(allPlansQuery.data ?? []).map((plan) => (
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
              allPlansQuery.data?.find((p) => p.id === selected)
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
    [allPlansQuery.data, assignMutation, assigning, canManage]
  );

  const currentPlan = currentQuery.data?.plans ?? null;
  const currentPlanId = currentQuery.data?.plan_id ?? currentPlan?.id ?? null;
  const vehicleCount = vehiclesQuery.data ?? 0;
  const softCap = currentPlan
    ? vehicleSoftCapCopy({
        vehicleCount,
        includedVehicles: currentPlan.included_vehicles,
        extraVehicleCents: currentPlan.extra_vehicle_cents,
        maxVehicles: currentPlan.max_vehicles,
      })
    : null;

  if (!canView) {
    return (
      <EmptyState
        title="No access"
        description="Organisation admins can view membership plans for their tenant."
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Membership"
        description="Vehicle-based plans in South African Rand. Extra vehicles are a soft cap — we nudge you to upgrade before you hit the ceiling."
      />

      {currentQuery.isLoading || plansQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <>
          <Card className="rounded-2xl border-border/80 shadow-none">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Current plan
                </CardTitle>
                <p className="font-heading text-2xl tracking-tight">
                  {currentPlan?.name ?? "No plan assigned"}
                </p>
                {currentPlan?.tagline ? (
                  <p className="text-sm text-accent">{currentPlan.tagline}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {currentQuery.data?.status ? (
                  <StatusBadge status={currentQuery.data.status} />
                ) : null}
                {currentPlan && isRecommendedPlan(currentPlan.code) ? (
                  <Badge variant="outline">Recommended</Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {currentPlan ? (
                <>
                  <p>
                    <span className="text-2xl font-semibold tracking-tight">
                      {formatZarFromCents(currentPlan.monthly_price_cents)}
                    </span>
                    <span className="ml-2 text-muted-foreground">/ month</span>
                  </p>
                  {softCap ? (
                    <p className="text-muted-foreground">{softCap}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {activeOrganisationId
                    ? "This organisation does not have a membership yet."
                    : "Select an organisation to see its current plan."}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3" role="list">
            {(plansQuery.data ?? []).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={
                  plan.id === currentPlanId || plan.code === currentPlan?.code
                }
                checkoutEnabled={
                  canManage &&
                  isStripeConfigured() &&
                  Boolean(plan.stripe_price_id) &&
                  Boolean(activeOrganisationId)
                }
                onCheckout={
                  activeOrganisationId
                    ? () => void startCheckout(activeOrganisationId, plan.id)
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}

      {canManage ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg tracking-tight">
              Assign plans
            </h2>
            <p className="text-sm text-muted-foreground">
              Platform owners can move organisations between plans. Stripe
              Checkout stays optional when a price ID is set.
            </p>
          </div>
          {subsQuery.isLoading ? (
            <LoadingSkeleton rows={5} />
          ) : (
            <DataTable
              columns={columns}
              data={subsQuery.data ?? []}
              emptyMessage="No subscriptions yet. Apply migration 00016 and refresh."
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
