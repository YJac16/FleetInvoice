import { Badge } from "@/components/ui/badge";
import type { EntityStatus, MembershipStatus, TripStatus } from "@/lib/constants";
import { STATUS_LABELS, TRIP_STATUS_LABELS } from "@/lib/constants";

type StatusBadgeProps = {
  status: EntityStatus | MembershipStatus | TripStatus | string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const label =
    status in STATUS_LABELS
      ? STATUS_LABELS[status as EntityStatus]
      : status in TRIP_STATUS_LABELS
        ? TRIP_STATUS_LABELS[status as TripStatus]
        : status.charAt(0).toUpperCase() + status.slice(1);

  const variant =
    status === "active" || status === "completed" || status === "in_progress"
      ? "default"
      : status === "suspended" || status === "cancelled"
        ? "destructive"
        : status === "assigned"
          ? "outline"
          : "secondary";

  return <Badge variant={variant}>{label}</Badge>;
}
