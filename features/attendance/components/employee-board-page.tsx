"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
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
import { boardingUrl } from "@/features/attendance/lib/qr";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { env } from "@/lib/env";
import {
  getCurrentEmployeeId,
  issueQrToken,
} from "@/services/attendance.service";
import { listMyTripPassengers } from "@/services/trip-passengers.service";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function EmployeeBoardPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const canSelf = can("attendance:self");

  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const linkQuery = useQuery({
    queryKey: organisationId
      ? ["current-employee", organisationId]
      : ["current-employee", "none"],
    queryFn: () => getCurrentEmployeeId(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const seatsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.myTripPassengers(organisationId)
      : ["my-trip-passengers", "none"],
    queryFn: () => listMyTripPassengers(organisationId!),
    enabled: Boolean(organisationId) && canSelf,
  });

  const activeSeat = useMemo(() => {
    return (seatsQuery.data ?? []).find((s) => s.status === "confirmed");
  }, [seatsQuery.data]);

  const initialToken = useMemo(() => tokenFromUrl, [tokenFromUrl]);

  useEffect(() => {
    if (!issuedToken) {
      setQrDataUrl(null);
      return;
    }
    const payload = boardingUrl(env.NEXT_PUBLIC_APP_URL, issuedToken);
    void QRCode.toDataURL(payload, { width: 260, margin: 1 }).then(setQrDataUrl);
  }, [issuedToken]);

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!organisationId || !linkQuery.data || !activeSeat) {
        throw new Error("No confirmed seat to board");
      }
      return issueQrToken({
        organisationId,
        tripId: activeSeat.trip_id,
        employeeId: linkQuery.data,
      });
    },
    onSuccess: (payload) => {
      setIssuedToken(payload.token);
      setBackupCode(payload.backup_code || null);
      toast.success("Boarding QR ready");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!canSelf) {
    return (
      <div>
        <PageHeader title="Board" description="Show your boarding QR." />
        <EmptyState
          title="Employee access required"
          description="Ask an admin to invite you as an employee and link your profile."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="Board" description="Show your boarding QR." />
        <EmptyState
          title="No organisation"
          description="Join an organisation before boarding."
        />
      </div>
    );
  }

  if (linkQuery.data === null && !linkQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Board" description="Show your boarding QR." />
        <EmptyState
          title="Profile not linked"
          description="Your login is not linked to an employee record. Ask an admin to set employees.profile_id to your user."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Board"
        description="Show your QR to the driver, or use the backup code if the camera fails."
      />

      {seatsQuery.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : !activeSeat ? (
        <EmptyState
          title="No seat to board"
          description="Book a seat first, then generate your boarding QR here."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {activeSeat.trips?.routes?.name ?? "Your trip"}
            </CardTitle>
            <CardDescription>
              {activeSeat.trips?.planned_start
                ? formatDateTime(activeSeat.trips.planned_start)
                : "—"}
              {" · "}
              {activeSeat.direction === "to_work" ? "To work" : "From work"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {issuedToken ? (
              <>
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="Boarding QR"
                    className="mx-auto rounded-md border bg-white p-3"
                    width={260}
                    height={260}
                  />
                ) : null}
                {backupCode ? (
                  <div className="rounded-xl bg-muted px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground">
                      Backup code (if QR fails)
                    </p>
                    <p className="font-mono text-2xl tracking-[0.3em]">
                      {backupCode}
                    </p>
                  </div>
                ) : null}
                <p className="text-center text-xs text-muted-foreground">
                  Show this screen to your driver. Do not share after boarding.
                </p>
              </>
            ) : (
              <Button
                className="w-full"
                disabled={issueMutation.isPending}
                onClick={() => issueMutation.mutate()}
              >
                {issueMutation.isPending
                  ? "Generating…"
                  : "Generate boarding QR"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {initialToken ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirm from link</CardTitle>
            <CardDescription>
              A boarding link opened this page — confirm below if needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScanQrForm
              initialToken={initialToken}
              onScanned={() => {
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.attendanceEvents(organisationId),
                });
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.myTripPassengers(organisationId),
                });
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
