"use client";

import { useQuery } from "@tanstack/react-query";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { listTripAudit } from "@/services/trip-admin.service";
import { formatDateTime } from "@/utils/format";
import { queryKeys } from "@/utils/query";

export function TripAuditTimeline({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const auditQuery = useQuery({
    queryKey: queryKeys.tripAudit(tripId),
    queryFn: () => listTripAudit(tripId),
    enabled,
  });

  if (!enabled) return null;

  if (auditQuery.isLoading) {
    return <LoadingSkeleton rows={2} />;
  }

  const rows = auditQuery.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No admin edits recorded yet.</p>
    );
  }

  return (
    <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3 text-xs">
      {rows.map((row) => (
        <li key={row.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{row.field_name}</span>
            <span className="text-muted-foreground">{formatDateTime(row.created_at)}</span>
          </div>
          <p className="text-muted-foreground">
            {row.old_value ?? "—"} → {row.new_value ?? "—"}
          </p>
          {row.reason ? <p className="italic text-muted-foreground">Reason: {row.reason}</p> : null}
        </li>
      ))}
    </ul>
  );
}
