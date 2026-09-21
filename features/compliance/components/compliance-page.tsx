"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  listComplianceRenewals,
  type ComplianceRenewalRow,
} from "@/services/compliance.service";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<ComplianceRenewalRow["kind"], string> = {
  driver_license: "Driver licence",
  driver_pdp: "Driver PDP",
  vehicle_document: "Vehicle document",
};

type WindowFilter = 30 | 60 | 90;

export function CompliancePage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("drivers:view") || can("vehicles:view");
  const [windowDays, setWindowDays] = useState<WindowFilter>(90);

  const renewalsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.complianceRenewals(organisationId, windowDays)
      : ["compliance-renewals", "none"],
    queryFn: () => listComplianceRenewals(organisationId!, windowDays),
    enabled: Boolean(organisationId && canView),
  });

  const rows = useMemo(
    () => renewalsQuery.data ?? [],
    [renewalsQuery.data]
  );

  const counts = useMemo(() => {
    const expired = rows.filter((r) => r.days_remaining < 0).length;
    const within30 = rows.filter(
      (r) => r.days_remaining >= 0 && r.days_remaining <= 30
    ).length;
    const within60 = rows.filter(
      (r) => r.days_remaining > 30 && r.days_remaining <= 60
    ).length;
    const within90 = rows.filter(
      (r) => r.days_remaining > 60 && r.days_remaining <= 90
    ).length;
    return { expired, within30, within60, within90 };
  }, [rows]);

  const columns = useMemo<ColumnDef<ComplianceRenewalRow, unknown>[]>(
    () => [
      {
        accessorKey: "kind",
        header: "Type",
        cell: ({ row }) => KIND_LABELS[row.original.kind] ?? row.original.kind,
      },
      { accessorKey: "entity_name", header: "Name" },
      { accessorKey: "detail", header: "Detail" },
      {
        accessorKey: "expires_on",
        header: "Expires",
        cell: ({ row }) => formatDate(row.original.expires_on),
      },
      {
        accessorKey: "days_remaining",
        header: "Days",
        cell: ({ row }) => {
          const days = row.original.days_remaining;
          const label =
            days < 0
              ? `${Math.abs(days)}d overdue`
              : days === 0
                ? "Today"
                : `${days}d`;
          return (
            <span
              className={cn(
                "font-medium",
                days < 0 && "text-destructive",
                days >= 0 && days <= 30 && "text-amber-600 dark:text-amber-400"
              )}
            >
              {label}
            </span>
          );
        },
      },
    ],
    []
  );

  if (!canView) {
    return (
      <EmptyState
        title="Access required"
        description="Driver or vehicle view permission is required for compliance renewals."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance renewals"
        description="Driver licences, PDPs, and vehicle documents expiring soon or overdue."
      />

      <div className="flex flex-wrap gap-2">
        {([30, 60, 90] as const).map((days) => (
          <Button
            key={days}
            variant={windowDays === days ? "default" : "outline"}
            size="sm"
            onClick={() => setWindowDays(days)}
          >
            ≤ {days} days
          </Button>
        ))}
      </div>

      {renewalsQuery.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Overdue"
              value={counts.expired}
              icon={AlertTriangle}
              description="Already past expiry"
            />
            <StatCard
              title="≤ 30 days"
              value={counts.within30}
              icon={ShieldCheck}
              description="Due within a month"
            />
            <StatCard
              title="31–60 days"
              value={counts.within60}
              icon={ShieldCheck}
            />
            <StatCard
              title="61–90 days"
              value={counts.within90}
              icon={ShieldCheck}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="Nothing due in this window"
              description={`No licence, PDP, or vehicle document renewals within ${windowDays} days.`}
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              emptyMessage="No renewals in this window."
            />
          )}
        </>
      )}
    </div>
  );
}
