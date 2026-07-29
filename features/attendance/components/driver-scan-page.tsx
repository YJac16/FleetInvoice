"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScanQrForm } from "@/features/attendance/components/scan-qr-form";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { queryKeys } from "@/utils/query";

export function DriverScanPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canScan = can("attendance:manage") || can("trips:self");

  if (!canScan) {
    return (
      <div>
        <PageHeader title="Scan boarding" description="Verify employee QR tokens." />
        <EmptyState
          title="No access"
          description="Driver or attendance permission is required to scan tokens."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Scan boarding"
        description="Scan the employee QR, or enter the backup code if the camera fails."
      />
      <Card>
        <CardHeader>
          <CardTitle>Record boarding</CardTitle>
          <CardDescription>
            Successful scans mark the token used and write an attendance event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScanQrForm
            onScanned={() => {
              if (!organisationId) return;
              void queryClient.invalidateQueries({
                queryKey: queryKeys.attendanceEvents(organisationId),
              });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
