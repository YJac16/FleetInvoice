import type { DriverInvoicePrintOverride } from "@/features/invoices/lib/invoice-print-settings";

export type IssuerForm = {
  supplier_name: string;
  supplier_address: string;
  supplier_phone: string;
  supplier_email: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  bank: string;
  account_name: string;
  account_number: string;
  branch_code: string;
  account_type: string;
};

export const EMPTY_ISSUER_FORM: IssuerForm = {
  supplier_name: "",
  supplier_address: "",
  supplier_phone: "",
  supplier_email: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  bank: "",
  account_name: "",
  account_number: "",
  branch_code: "",
  account_type: "",
};

function clean<T extends Record<string, unknown>>(block: T): T | undefined {
  const entries = Object.entries(block).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== ""
  );
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

/** Form -> RPC settings. Empty blocks are left out (print falls back per block). */
export function buildDriverInvoicePrintOverride(form: IssuerForm): DriverInvoicePrintOverride | null {
  const t = (v: string) => v.trim();
  const supplier = clean({
    name: t(form.supplier_name),
    address_lines: form.supplier_address
      .split(/[,\n]/)
      .map((line) => line.trim())
      .filter(Boolean),
    phone: t(form.supplier_phone),
    email: t(form.supplier_email),
  });
  const contact = clean({ name: t(form.contact_name), phone: t(form.contact_phone), email: t(form.contact_email) });
  const banking = clean({
    bank: t(form.bank),
    account_name: t(form.account_name),
    account_number: t(form.account_number),
    branch_code: t(form.branch_code),
    account_type: t(form.account_type),
  });
  const out: DriverInvoicePrintOverride = {};
  if (supplier) out.supplier = supplier;
  if (contact) out.contact = contact;
  if (banking) out.banking = banking;
  return Object.keys(out).length ? out : null;
}

export function overrideToIssuerForm(override: DriverInvoicePrintOverride | null): IssuerForm {
  if (!override) return { ...EMPTY_ISSUER_FORM };
  return {
    supplier_name: override.supplier?.name ?? "",
    supplier_address: (override.supplier?.address_lines ?? []).join(", "),
    supplier_phone: override.supplier?.phone ?? "",
    supplier_email: override.supplier?.email ?? "",
    contact_name: override.contact?.name ?? "",
    contact_phone: override.contact?.phone ?? "",
    contact_email: override.contact?.email ?? "",
    bank: override.banking?.bank ?? "",
    account_name: override.banking?.account_name ?? "",
    account_number: override.banking?.account_number ?? "",
    branch_code: override.banking?.branch_code ?? "",
    account_type: override.banking?.account_type ?? "",
  };
}
