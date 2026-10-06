import type { SupabaseClient } from "@supabase/supabase-js";

type InvoiceRow = {
  id: string;
  organisation_id: string;
  company_id: string;
  status: string;
};

export async function assertInvoiceManageAccess(
  supabase: SupabaseClient,
  invoice: InvoiceRow
): Promise<void> {
  const { data: isOwner, error: ownerError } = await supabase.rpc(
    "is_platform_owner"
  );
  if (ownerError) throw ownerError;
  if (isOwner) return;

  const { data: hasOpsRole, error: opsError } = await supabase.rpc(
    "has_org_role_names",
    {
      org_id: invoice.organisation_id,
      allowed: ["organisation_admin", "manager", "dispatcher"],
    }
  );
  if (opsError) throw opsError;
  if (hasOpsRole) return;

  throw new Error("Not authorised to manage this invoice");
}
