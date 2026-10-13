export type WaybillBillingReadiness = {
  hasTripRate: boolean;
  hasBillTo: boolean;
};

export type WaybillMode = "send" | "backfill";

/**
 * Admin-facing reasons a waybill must not be created. Mirrors the checks that
 * would otherwise only fail when the driver completes the trip (invoice sync):
 * per-company trip rate (resolve_trip_line_rate) and org bill-to company
 * (resolve_invoice_bill_to_company_id).
 */
export function waybillBillingProblems(
  readiness: WaybillBillingReadiness | null | undefined,
  companyName: string | null | undefined,
  mode: WaybillMode
): string[] {
  if (!readiness) return [];
  const action = mode === "send" ? "sending this waybill to a driver" : "saving this waybill";
  const company = companyName?.trim() || "this company";
  const problems: string[] = [];
  if (!readiness.hasTripRate) {
    problems.push(
      `No trip rate configured for ${company} on this date. Add a trip rate for ${company} (Companies → Edit → Trip rate, or Rate cards) before ${action}.`
    );
  }
  if (!readiness.hasBillTo) {
    problems.push(
      `This organisation has no invoice bill-to company configured, so completed trips cannot be invoiced. Ask GoOps support to set the bill-to company before ${action}.`
    );
  }
  return problems;
}

/** PostgREST / Postgres "function does not exist" (migration not applied yet). */
export function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  if (code === "PGRST202" || code === "42883") return true;
  return typeof message === "string" && /could not find the function/i.test(message);
}
