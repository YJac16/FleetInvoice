import { Badge } from "@/components/ui/badge";
import type { BillStatus } from "@/features/maintenance/types";

export function BillStatusBadge({ status }: { status: BillStatus }) {
  return status === "approved" ? (
    <Badge variant="default">Approved</Badge>
  ) : (
    <Badge variant="secondary">Draft</Badge>
  );
}
