"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useOrg } from "@/components/layout/org-context";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listFuelFillups } from "@/services/fuel-fillups.service";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function FuelReviewPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canReview = can("fuel:review");

  const fillupsQuery = useQuery({
    queryKey: organisationId ? queryKeys.fuelFillups(organisationId) : ["fuel", "none"],
    queryFn: () => listFuelFillups(organisationId!),
    enabled: Boolean(organisationId) && canReview,
  });

  if (!canReview) {
    return <p className="p-6 text-muted-foreground">You cannot access the fuel review queue.</p>;
  }

  const pending = (fillupsQuery.data ?? []).filter(
    (f) => (f as { review_status?: string }).review_status === "pending_review"
  );

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Fuel slip review"
        description="Pending entries sorted for admin review. Approve, query, or reject from detail (v1 queue)."
      />
      <div className="flex gap-2">
        <Link href="/fuel" className="inline-flex">
          <Button variant="outline" type="button">
            All fuel rows
          </Button>
        </Link>
      </div>
      <ul className="divide-y rounded-lg border">
        {pending.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div>
              <div className="font-medium">{row.station_name ?? "Fuel slip"}</div>
              <div className="text-muted-foreground">{formatDateTime(row.filled_at)}</div>
            </div>
            <div className="text-muted-foreground">
              {(row as { entry_method?: string }).entry_method ?? "—"} · R{row.total_amount ?? "—"}
            </div>
          </li>
        ))}
        {!pending.length ? (
          <li className="p-6 text-muted-foreground">No slips pending review.</li>
        ) : null}
      </ul>
    </div>
  );
}
