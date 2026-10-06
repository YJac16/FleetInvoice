/**
 * Client mirror of public.resolve_invoice_bill_to_company_id.
 * The SQL function is revoked from authenticated (00055); the Users screen
 * uses this helper so the bill-to company is hidden before insert.
 */
export type BillToCompanyRef = {
  id: string;
  name: string;
  created_at?: string | null;
};

const WCL_NAME = "wcl trading cc";

export function resolveBillToCompanyId(
  companies: readonly BillToCompanyRef[],
  settings: { invoice_bill_to_company_id?: unknown } | null | undefined
): string | null {
  const raw = settings?.invoice_bill_to_company_id;
  if (typeof raw === "string" && raw.trim() !== "") {
    const settingId = raw.trim();
    const pointed = companies.find((company) => company.id === settingId);
    if (pointed) return pointed.id;
  }

  const named = companies
    .filter((company) => company.name.trim().toLowerCase() === WCL_NAME)
    .slice()
    .sort((a, b) => {
      const aTime = a.created_at ?? "";
      const bTime = b.created_at ?? "";
      if (aTime === bTime) return 0;
      return aTime < bTime ? -1 : 1;
    });

  return named[0]?.id ?? null;
}
