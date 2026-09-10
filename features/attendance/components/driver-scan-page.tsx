"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScanQrForm } from "@/features/attendance/components/scan-qr-form";
import { driverQrUrl } from "@/features/attendance/lib/qr";
import {
  activeTrip,
  upcomingTrips,
} from "@/features/driver-portal/lib/trip-labels";
import {
  nowInDriverTz,
  todayDateString,
} from "@/features/driver-portal/lib/dates";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { env } from "@/lib/env";
import { issueDriverQrToken } from "@/services/attendance.service";
import { listMyStaffTrips } from "@/services/staff-trips.service";
import { getErrorMessage } from "@/utils/errors";
import { queryKeys } from "@/utils/query";

function tomorrowDateString(): string {
  return nowInDriverTz().add(1, "day").format("YYYY-MM-DD");
}

export function DriverScanPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canScan = can("attendance:manage") || can("trips:self");
  const today = todayDateString();
  const tomorrow = tomorrowDateString();

  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const tripsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.staffTrips(organisationId, today, tomorrow)
      : ["staff-trips", "none"],
    queryFn: () => listMyStaffTrips(organisationId!, today, tomorrow),
    enabled: Boolean(organisationId) && canScan,
  });

  const pairingTrip = useMemo(() => {
    const trips = tripsQuery.data ?? [];
    return activeTrip(trips) ?? upcomingTrips(trips)[0] ?? null;
  }, [tripsQuery.data]);

  useEffect(() => {
    if (!issuedToken) {
      setQrDataUrl(null);
      return;
    }
    const payload = driverQrUrl(env.NEXT_PUBLIC_APP_URL, issuedToken);
    void QRCode.toDataURL(payload, { width: 260, margin: 1 }).then(setQrDataUrl);
  }, [issuedToken]);

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!organisationId) throw new Error("No organisation");
      return issueDriverQrToken({
        organisationId,
        tripId: pairingTrip?.id ?? null,
      });
    },
    onSuccess: (payload) => {
      setIssuedToken(payload.token);
      toast.success("Driver QR ready — let the employee scan this");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

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
        description="Scan an employee QR only if you are assigned to their trip. Employees can also scan your QR."
      />
      <Card>
        <CardHeader>
          <CardTitle>Show driver QR</CardTitle>
          <CardDescription>
            {pairingTrip
              ? `Pairs with your ${pairingTrip.area_text ?? "assigned"} trip. Short-lived; regenerate if it expires.`
              : "You need an assigned staff trip today to generate a pairing QR."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {issuedToken && qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Driver pairing QR"
              className="mx-auto rounded-md border bg-white p-3"
              width={260}
              height={260}
            />
          ) : null}
          <Button
            className="w-full"
            disabled={issueMutation.isPending || !pairingTrip}
            onClick={() => issueMutation.mutate()}
          >
            {issueMutation.isPending ? "Generating…" : "Generate driver QR"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scan employee QR</CardTitle>
          <CardDescription>
            Successful scans mark the token used and write an attendance event.
            Unassigned drivers are rejected.
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
