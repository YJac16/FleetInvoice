"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { QrCode, ScanLine } from "lucide-react";
import { useMemo, useState } from "react";

import { useOrg } from "@/components/layout/org-context";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IssueQrDialog } from "@/features/attendance/components/issue-qr-dialog";
import { ManualBoardingDialog } from "@/features/attendance/components/manual-boarding-dialog";
import { ScanQrForm } from "@/features/attendance/components/scan-qr-form";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { listAttendanceEvents } from "@/services/attendance.service";
import type { AttendanceEvent } from "@/types";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function AttendancePage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const queryClient = useQueryClient();
  const canView = can("attendance:view") || can("attendance:manage");
  const canManage = can("attendance:manage");
  const [issueOpen, setIssueOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [showScan, setShowScan] = useState(false);

  const eventsQuery = useQuery({
    queryKey: organisationId
      ? queryKeys.attendanceEvents(organisationId)
      : ["attendance-events", "none"],
    queryFn: () => listAttendanceEvents(organisationId!),
    enabled: Boolean(organisationId) && canView,
  });

  async function refresh() {
    if (!organisationId) return;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.attendanceEvents(organisationId),
    });
  }

  const columns = useMemo<ColumnDef<AttendanceEvent, unknown>[]>(
    () => [
      {
        id: "employee",
        header: "Employee",
        cell: ({ row }) => row.original.employees?.full_name ?? "—",
      },
      {
        id: "route",
        header: "Route",
        cell: ({ row }) => row.original.trips?.routes?.name ?? "—",
      },
      {
        accessorKey: "event_type",
        header: "Event",
        cell: ({ row }) => <StatusBadge status={row.original.event_type} />,
      },
      {
        accessorKey: "created_at",
        header: "When",
        cell: ({ row }) => formatDateTime(row.original.created_at),
      },
      {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ row }) => row.original.notes ?? "—",
      },
    ],
    []
  );

  if (!canView) {
    return (
      <div>
        <PageHeader title="Attendance" description="QR boarding and presence." />
        <EmptyState
          title="No access"
          description="You need attendance view permission to open this page."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="Attendance" description="QR boarding and presence." />
        <EmptyState
          title="No organisation"
          description="Select an organisation to manage attendance."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Issue boarding QR codes, scan tokens, and review presence events."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setShowScan((v) => !v)}>
                <ScanLine className="size-4" />
                {showScan ? "Hide scan" : "Scan token"}
              </Button>
              <Button variant="outline" onClick={() => setManualOpen(true)}>
                Manual boarding
              </Button>
              <Button onClick={() => setIssueOpen(true)}>
                <QrCode className="size-4" />
                Issue QR
              </Button>
            </div>
          ) : null
        }
      />

      {canManage && showScan ? (
        <Card>
          <CardHeader>
            <CardTitle>Scan boarding token</CardTitle>
            <CardDescription>
              Paste a token from a QR scan or employee email to record boarding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScanQrForm onScanned={() => void refresh()} />
          </CardContent>
        </Card>
      ) : null}

      {eventsQuery.isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : (eventsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No attendance events"
          description="Issue a boarding QR for a trip to start recording presence."
        />
      ) : (
        <DataTable columns={columns} data={eventsQuery.data ?? []} />
      )}

      <IssueQrDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        organisationId={organisationId}
        onIssued={() => void refresh()}
      />
      <ManualBoardingDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        organisationId={organisationId}
        onRecorded={() => void refresh()}
      />
    </div>
  );
}
