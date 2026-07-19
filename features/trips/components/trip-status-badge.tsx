import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TripStatus } from "@/types/database";

const STATUS_STYLES: Record<TripStatus, string> = {
  pending:
    "border-transparent bg-warning/15 text-warning-foreground text-[#b45309] dark:text-[#fbbf24]",
  approved:
    "border-transparent bg-success/15 text-[#15803d] dark:text-[#4ade80]",
  rejected: "border-transparent bg-destructive/15 text-destructive",
  invoiced:
    "border-transparent bg-accent/15 text-accent dark:text-[#93c5fd]",
};

const STATUS_LABELS: Record<TripStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  invoiced: "Invoiced",
};

interface TripStatusBadgeProps {
  status: TripStatus;
  className?: string;
}

export function TripStatusBadge({ status, className }: TripStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", STATUS_STYLES[status], className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
