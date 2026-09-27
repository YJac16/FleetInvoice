"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ChevronDown, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useOrg } from "@/components/layout/org-context";
import { ComplianceExpiryBadge } from "@/features/compliance/components/compliance-expiry-badge";
import { PRDP_SHORT_LABEL } from "@/features/compliance/lib/prdp-label";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  listComplianceMissingData,
  listComplianceRenewals,
  type ComplianceMissingRow,
  type ComplianceRenewalRow,
} from "@/services/compliance.service";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<ComplianceRenewalRow["subject_kind"], string> = {
  driver_license: "Driver licence",
  driver_pdp: `Driver ${PRDP_SHORT_LABEL}`,
  vehicle_permit: "Vehicle operating permit",
  vehicle_disc: "Vehicle licence disc",
  vehicle_document: "Vehicle document",
};

const MISSING_LABELS: Record<string, string> = {
  missing_license_expiry: "Missing driver licence expiry",
  missing_pdp: `Missing ${PRDP_SHORT_LABEL} (number or expiry)`,
  missing_license_code: "Missing licence code",
  missing_vehicle_permit: "Missing vehicle permit (number or expiry)",
  missing_disc_expiry: "Missing licence disc expiry",
  missing_driver_assignment: "Active drivers without a vehicle",
  missing_vehicle_assignment: "Active vehicles without a driver",
};

type WindowFilter = 30 | 60 | 90;

function editLink(row: ComplianceRenewalRow, canManage: boolean): string | null {
  if (!canManage) return null;
  if (row.subject_kind === "driver_license" || row.subject_kind === "driver_pdp") {
    return `/drivers?highlight=${row.subject_id}`;
  }
  if (row.vehicle_id) return `/vehicles?highlight=${row.vehicle_id}`;
  return null;
}

export function CompliancePage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canView = can("drivers:view") || can("vehicles:view");
  const canManage = can("drivers:manage") || can("vehicles:manage");
  const [windowDays, setWindowDays] = useState<WindowFilter>(90);
  const [missingOpen, setMissingOpen] = useState(false);

  const renewalsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.complianceRenewals(organisationId, windowDays)
      : ["compliance-renewals", "none"],
    queryFn: () => listComplianceRenewals(organisationId!, windowDays),
    enabled: Boolean(organisationId && canView),
  });

  const missingQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.complianceMissing(organisationId)
      : ["compliance-missing", "none"],
    queryFn: () => listComplianceMissingData(organisationId!),
    enabled: Boolean(organisationId && canView),
  });

  const rows = useMemo(() => renewalsQuery.data ?? [], [renewalsQuery.data]);
  const missing = missingQuery.data ?? [];

  const missingSummary = useMemo(() => {
    const drivers = new Set(
      missing.filter((m) => m.entity_kind === "driver").map((m) => m.entity_id)
    );
    const vehicles = new Set(
      missing.filter((m) => m.entity_kind === "vehicle").map((m) => m.entity_id)
    );
    return { drivers: drivers.size, vehicles: vehicles.size };
  }, [missing]);

  const missingByCategory = useMemo(() => {
    const map = new Map<string, ComplianceMissingRow[]>();
    for (const row of missing) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return map;
  }, [missing]);

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
        accessorKey: "subject_kind",
        header: "Type",
        cell: ({ row }) =>
          KIND_LABELS[row.original.subject_kind] ?? row.original.subject_kind,
      },
      { accessorKey: "subject_name", header: "Name" },
      {
        id: "detail",
        header: "Detail",
        cell: ({ row }) =>
          row.original.document_label ??
          row.original.registration_number ??
          "—",
      },
      {
        accessorKey: "expires_on",
        header: "Expires",
        cell: ({ row }) => formatDate(row.original.expires_on),
      },
      {
        accessorKey: "days_remaining",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ComplianceExpiryBadge expiresOn={row.original.expires_on} />
            <span className="text-xs text-muted-foreground">
              {row.original.days_remaining < 0
                ? `${Math.abs(row.original.days_remaining)}d overdue`
                : `${row.original.days_remaining}d`}
            </span>
          </div>
        ),
      },
      {
        id: "link",
        header: "",
        cell: ({ row }) => {
          const href = editLink(row.original, canManage);
          if (!href) return null;
          return (
            <Link href={href} className="text-sm text-primary underline">
              Edit
            </Link>
          );
        },
      },
    ],
    [canManage]
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
        description={`Driver licences, ${PRDP_SHORT_LABEL}, vehicle permits, discs, and documents.`}
      />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setMissingOpen((v) => !v)}
        >
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Compliance data incomplete: {missingSummary.drivers} drivers /{" "}
            {missingSummary.vehicles} vehicles
          </p>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform",
              missingOpen && "rotate-180"
            )}
          />
        </button>
        {missingOpen ? (
          <div className="mt-3 space-y-4">
            {missingQuery.isLoading ? (
              <LoadingSkeleton rows={2} />
            ) : missing.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All tracked fields are captured for active drivers and vehicles.
              </p>
            ) : (
              Object.entries(MISSING_LABELS).map(([category, label]) => {
                const items = missingByCategory.get(category) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label} ({items.length})
                    </p>
                    <ul className="mt-1 space-y-1">
                      {items.slice(0, 8).map((item) => (
                        <li key={`${category}-${item.entity_id}`}>
                          {canManage ? (
                            <Link
                              href={item.link_path}
                              className="text-sm text-primary underline"
                            >
                              {item.entity_name}
                            </Link>
                          ) : (
                            <span className="text-sm">{item.entity_name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

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
              description={`No compliance renewals within ${windowDays} days.`}
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
