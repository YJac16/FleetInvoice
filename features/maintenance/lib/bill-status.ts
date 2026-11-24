import type { BillStatus } from "@/features/maintenance/types";

/** UI/export label for a bill status. The DB value 'approved' is shown as "Final". */
export function billStatusLabel(status: BillStatus | string): string {
  if (status === "approved") return "Final";
  if (status === "draft") return "Draft";
  return status;
}
