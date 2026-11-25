import type { Permission } from "@/lib/permissions";
import type { ReportType } from "@/features/reports/schemas/report";

/**
 * Which report kinds a role sees. The commercial report (invoices, plus
 * payroll runs unless hidden) needs invoices:view, so supervisor loses it.
 * Payroll inside it needs payroll:view, so dispatcher sees invoices only.
 */
export function visibleReportKinds(
  kinds: readonly ReportType[],
  can: (permission: Permission) => boolean,
  hidePayroll = false
): { kinds: ReportType[]; hidePayroll: boolean } {
  return {
    kinds: kinds.filter((k) => k !== "commercial" || can("invoices:view")),
    hidePayroll: hidePayroll || !can("payroll:view"),
  };
}
