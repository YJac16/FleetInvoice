"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ComplianceExpiryBadge } from "@/features/compliance/components/compliance-expiry-badge";
import {
  complianceStatusForDate,
  type ComplianceExpiryStatus,
} from "@/features/compliance/lib/compliance-status";
import { maskSensitiveNumber } from "@/features/compliance/lib/mask-sensitive";
import {
  PRDP_FULL_LABEL,
  PRDP_SHORT_LABEL,
} from "@/features/compliance/lib/prdp-label";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { createClient } from "@/lib/supabase/client";
import { listMyCompliance } from "@/services/compliance.service";
import type { Driver, Vehicle } from "@/types";
import { formatDate } from "@/utils/format";
import { queryKeys } from "@/utils/query";

function licenseCodeLabel(driver: Driver): string {
  if (!driver.license_code) return "Not captured";
  if (driver.license_code === "Other") {
    return `Other: ${driver.license_code_other ?? ""}`;
  }
  return driver.license_code;
}

async function fetchMyDriverAndVehicle(organisationId: string): Promise<{
  driver: Driver | null;
  vehicle: Vehicle | null;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { driver: null, vehicle: null };

  const { data: driver, error: dErr } = await supabase
    .from("drivers")
    .select("*")
    .eq("organisation_id", organisationId)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (dErr) throw dErr;
  if (!driver) return { driver: null, vehicle: null };

  const { data: assignment, error: aErr } = await supabase
    .from("driver_vehicle_assignments")
    .select("vehicle_id")
    .eq("organisation_id", organisationId)
    .eq("driver_id", driver.id)
    .is("ends_on", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (aErr) throw aErr;

  if (!assignment?.vehicle_id) {
    return { driver: driver as Driver, vehicle: null };
  }

  const { data: vehicle, error: vErr } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", assignment.vehicle_id)
    .maybeSingle();
  if (vErr) throw vErr;

  return { driver: driver as Driver, vehicle: (vehicle as Vehicle) ?? null };
}

function DocCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  badgeDate,
}: {
  label: string;
  value: React.ReactNode;
  badgeDate?: string | null;
}) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-3">
      <div>
        <p className="text-zinc-500">{label}</p>
        <p className="font-medium text-zinc-100">{value}</p>
      </div>
      {badgeDate !== undefined ? (
        <ComplianceExpiryBadge expiresOn={badgeDate} />
      ) : null}
    </div>
  );
}

export function DriverDocumentsPage() {
  const organisationId = useActiveOrgId();

  const profileQuery = useQuery({
    queryKey: organisationId
      ? ["my-driver-profile", organisationId]
      : ["my-driver-profile", "none"],
    queryFn: () => fetchMyDriverAndVehicle(organisationId!),
    enabled: Boolean(organisationId),
  });

  const complianceQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.myCompliance(organisationId)
      : ["my-compliance", "none"],
    queryFn: () => listMyCompliance(organisationId!),
    enabled: Boolean(organisationId),
  });

  if (!organisationId) {
    return (
      <EmptyState
        title="No organisation"
        description="Select an organisation to view your documents."
      />
    );
  }

  if (profileQuery.isLoading) {
    return <LoadingSkeleton rows={4} />;
  }

  const { driver, vehicle } = profileQuery.data ?? {
    driver: null,
    vehicle: null,
  };

  if (!driver) {
    return (
      <EmptyState
        title="No driver profile"
        description="Your login is not linked to a driver record."
      />
    );
  }

  const urgent =
    complianceQuery.data?.some((row) => {
      const s = row.status as ComplianceExpiryStatus;
      return s === "expired" || s === "due_7" || s === "due_30";
    }) ?? false;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">My docs</h1>
        <p className="text-sm text-zinc-500">
          Read-only view of your licence, {PRDP_SHORT_LABEL}, and assigned vehicle.
        </p>
      </div>

      {urgent ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          One or more items need attention soon. Details below.
        </p>
      ) : null}

      <DocCard title="My licence">
        <Row
          label="Licence number"
          value={maskSensitiveNumber(driver.license_number)}
        />
        <Row label="Licence code" value={licenseCodeLabel(driver)} />
        <Row
          label="Expires"
          value={
            driver.license_expires_on
              ? formatDate(driver.license_expires_on)
              : "Not captured"
          }
          badgeDate={driver.license_expires_on}
        />
      </DocCard>

      <DocCard title={PRDP_FULL_LABEL}>
        <Row
          label={`${PRDP_SHORT_LABEL} number`}
          value={maskSensitiveNumber(driver.pdp_number)}
        />
        <Row
          label="Expires"
          value={
            driver.pdp_expires_on
              ? formatDate(driver.pdp_expires_on)
              : "Not captured"
          }
          badgeDate={driver.pdp_expires_on}
        />
      </DocCard>

      <DocCard title="My vehicle">
        {!vehicle ? (
          <p className="min-h-11 py-2 text-zinc-400">
            No vehicle assigned. Contact your fleet admin.
          </p>
        ) : (
          <>
            <Row
              label="Registration"
              value={vehicle.registration_number ?? "—"}
            />
            <Row label="Year" value={vehicle.model_year ?? "—"} />
            <Row
              label="Make / model"
              value={[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}
            />
            <Row label="Colour" value={vehicle.colour ?? "—"} />
            <Row label="Classification" value={vehicle.classification ?? "—"} />
            <Row
              label="Operating permit (fleet record)"
              value={vehicle.operating_permit_number ?? "Not captured"}
            />
            <Row
              label="Permit expiry"
              value={
                vehicle.operating_permit_expires_on
                  ? formatDate(vehicle.operating_permit_expires_on)
                  : "Not captured"
              }
              badgeDate={vehicle.operating_permit_expires_on}
            />
            <Row
              label="Licence disc expiry"
              value={
                vehicle.license_disc_expires_on
                  ? formatDate(vehicle.license_disc_expires_on)
                  : "Not captured"
              }
              badgeDate={vehicle.license_disc_expires_on}
            />
          </>
        )}
      </DocCard>

      <p className="text-center text-sm text-zinc-500">
        Something wrong? Contact your admin.
      </p>
      <p className="sr-only">
        Licence status:{" "}
        {complianceStatusForDate(driver.license_expires_on)}
      </p>
    </div>
  );
}

export function DriverComplianceBanner() {
  const organisationId = useActiveOrgId();
  const complianceQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.myCompliance(organisationId)
      : ["my-compliance", "none"],
    queryFn: () => listMyCompliance(organisationId!),
    enabled: Boolean(organisationId),
  });

  const show = (complianceQuery.data ?? []).some(
    (r) => r.days_remaining <= 30
  );

  if (!show) return null;

  return (
    <Link
      href="/driver/documents"
      className="mb-4 flex min-h-11 items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-50"
    >
      <span>Licence, PrDP, or vehicle docs need attention</span>
      <span className="text-xs underline">My docs</span>
    </Link>
  );
}
