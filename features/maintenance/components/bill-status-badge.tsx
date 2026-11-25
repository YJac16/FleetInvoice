import { Badge } from "@/components/ui/badge";
import { billStatusLabel } from "@/features/maintenance/lib/bill-status";
import type { BillStatus } from "@/features/maintenance/types";

/** The DB value stays "approved"; the UI label is "Final". */
export function BillStatusBadge({ status }: { status: BillStatus }) {
  return status === "approved" ? (
    <Badge variant="default">{billStatusLabel(status)}</Badge>
  ) : (
    <Badge variant="secondary">{billStatusLabel(status)}</Badge>
  );
}
