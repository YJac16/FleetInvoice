import { createClient } from "@/lib/supabase/client";
import {
  fetchDriverInvoicePrintOverride,
  type OverrideClient,
} from "@/features/invoices/lib/driver-invoice-print-override";
import type { DriverInvoicePrintOverride } from "@/features/invoices/lib/invoice-print-settings";

export function getDriverInvoicePrintOverride(
  organisationId: string,
  driverId: string
) {
  return fetchDriverInvoicePrintOverride(
    createClient() as unknown as OverrideClient,
    organisationId,
    driverId
  );
}

/** Org admins only (enforced in the RPC). Pass null to clear. */
export async function setDriverInvoicePrintOverride(
  driverId: string,
  settings: DriverInvoicePrintOverride | null
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_driver_invoice_print_override", {
    p_driver_id: driverId,
    p_settings: settings,
  });
  if (error) throw error;
}
