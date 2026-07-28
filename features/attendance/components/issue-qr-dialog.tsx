"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { boardingUrl } from "@/features/attendance/lib/qr";
import { env } from "@/lib/env";
import { issueQrToken } from "@/services/attendance.service";
import { listEmployees } from "@/services/employees.service";
import { listTrips } from "@/services/trips.service";
import { getErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

type IssueQrDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  defaultTripId?: string | null;
  onIssued: () => void;
};

export function IssueQrDialog({
  open,
  onOpenChange,
  organisationId,
  defaultTripId,
  onIssued,
}: IssueQrDialogProps) {
  const [tripId, setTripId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTripId("");
      setEmployeeId("");
      setRawToken(null);
      setBackupCode(null);
      setQrDataUrl(null);
      return;
    }
    if (defaultTripId) setTripId(defaultTripId);
  }, [open, defaultTripId]);

  useEffect(() => {
    if (!rawToken) {
      setQrDataUrl(null);
      return;
    }
    const payload = boardingUrl(env.NEXT_PUBLIC_APP_URL, rawToken);
    void QRCode.toDataURL(payload, { width: 220, margin: 1 }).then(setQrDataUrl);
  }, [rawToken]);

  const tripsQuery = useQuery({
    queryKey: queryKeys.trips(organisationId),
    queryFn: () => listTrips(organisationId),
    enabled: open,
  });

  const employeesQuery = useQuery({
    queryKey: queryKeys.employees(organisationId),
    queryFn: () => listEmployees(organisationId),
    enabled: open,
  });

  const trips = useMemo(
    () =>
      (tripsQuery.data ?? []).filter((t) =>
        ["planned", "assigned", "in_progress"].includes(t.status)
      ),
    [tripsQuery.data]
  );
  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data]
  );

  const issueMutation = useMutation({
    mutationFn: () => {
      if (!tripId) throw new Error("Select a trip");
      if (!employeeId) throw new Error("Select an employee");
      return issueQrToken({
        organisationId,
        tripId,
        employeeId,
      });
    },
    onSuccess: (payload) => {
      setRawToken(payload.token);
      setBackupCode(payload.backup_code || null);
      toast.success("Boarding QR issued");
      onIssued();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  async function copyToken() {
    if (!rawToken) return;
    try {
      await navigator.clipboard.writeText(rawToken);
      toast.success("Token copied");
    } catch {
      toast.error("Unable to copy token");
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={rawToken ? "Boarding code ready" : "Issue boarding QR"}
      description={
        rawToken
          ? "Show this code to the employee or copy it for the driver scan screen. It is shown only once."
          : "Create a short-lived boarding token for an employee on a trip."
      }
    >
      {rawToken ? (
        <div className="space-y-4">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Boarding QR code"
              className="mx-auto rounded-md border bg-white p-2"
              width={220}
              height={220}
            />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="raw-token">Token</Label>
            <Input id="raw-token" readOnly value={rawToken} className="font-mono text-xs" />
          </div>
          {backupCode ? (
            <div className="space-y-2">
              <Label htmlFor="backup-code">Backup code</Label>
              <Input
                id="backup-code"
                readOnly
                value={backupCode}
                className="font-mono text-lg tracking-widest"
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" onClick={() => void copyToken()}>
              Copy token
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Trip</Label>
            <Select value={tripId} onValueChange={(value) => setTripId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select trip" />
              </SelectTrigger>
              <SelectContent>
                {trips.map((trip) => (
                  <SelectItem key={trip.id} value={trip.id}>
                    {(trip.routes?.name ?? "Trip") +
                      " · " +
                      formatDateTime(trip.planned_start)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select
              value={employeeId}
              onValueChange={(value) => setEmployeeId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            disabled={issueMutation.isPending}
            onClick={() => issueMutation.mutate()}
          >
            {issueMutation.isPending ? "Issuing…" : "Issue QR"}
          </Button>
        </div>
      )}
    </FormDialog>
  );
}
