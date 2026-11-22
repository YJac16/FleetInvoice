import {
  parseDriverInvoicePrintOverride,
  type DriverInvoicePrintOverride,
} from "@/features/invoices/lib/invoice-print-settings";

type QueryError = { code?: string; message?: string } | null;

/** Table not deployed yet (00072 not applied) — print must keep working. */
export function isMissingOverrideTable(error: QueryError): boolean {
  if (!error) return false;
  // Codes only: a permission error must surface, never fall back to org banking.
  return error.code === "42P01" || error.code === "PGRST205";
}

export type OverrideClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => PromiseLike<{
            data: { settings: unknown } | null;
            error: QueryError;
          }>;
        };
      };
    };
  };
};

/**
 * Reads a driver's invoice issuer override. RLS returns no row to roles that
 * cannot read invoices, so this is null for drivers / company managers.
 */
export async function fetchDriverInvoicePrintOverride(
  client: OverrideClient,
  organisationId: string,
  driverId: string
): Promise<DriverInvoicePrintOverride | null> {
  const { data, error } = await client
    .from("driver_invoice_print_overrides")
    .select("settings")
    .eq("organisation_id", organisationId)
    .eq("driver_id", driverId)
    .maybeSingle();
  if (error) {
    if (isMissingOverrideTable(error)) return null;
    throw error;
  }
  return parseDriverInvoicePrintOverride(data?.settings ?? null);
}
