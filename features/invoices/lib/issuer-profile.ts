import type { Company, Organisation } from "@/types";

export type InvoiceIssuerProfile = {
  name: string;
  lines: string[];
  phone: string;
};

export type InvoiceBankingProfile = {
  bank: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
};

export type InvoiceFooterProfile = {
  name: string;
  phone: string;
  email: string;
};

export type InvoiceBillToProfile = {
  name: string;
  lines: string[];
  phone: string;
};

const DEFAULT_ISSUER: InvoiceIssuerProfile = {
  name: "Yaseen Jacobs",
  lines: [
    "47 Upper Duke Street",
    "Walmer Estate",
    "Cape Town",
    "Western Cape",
    "7925",
  ],
  phone: "082 327 7446",
};

const DEFAULT_BANKING: InvoiceBankingProfile = {
  bank: "FNB",
  accountName: "Yaseen Jacobs",
  accountNumber: "62731713170",
  branchCode: "250655",
  accountType: "Cheque Account",
};

const DEFAULT_FOOTER: InvoiceFooterProfile = {
  name: "Yaseen Jacobs",
  phone: "082 327 7446",
  email: "yaseenjacobs97@gmail.com",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter(Boolean);
}

function pickProfile<T extends Record<string, string>>(
  raw: unknown,
  defaults: T,
  keys: (keyof T)[]
): T {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...defaults };
  for (const key of keys) {
    const v = asString(source[key as string]);
    if (v) out[key] = v as T[keyof T];
  }
  return out;
}

export function resolveInvoiceIssuer(
  organisation: Pick<Organisation, "settings">
): InvoiceIssuerProfile {
  const raw = organisation.settings?.invoice_issuer;
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = asString(source.name) || DEFAULT_ISSUER.name;
  const phone = asString(source.phone) || DEFAULT_ISSUER.phone;
  const lines = asStringArray(source.lines);
  return {
    name,
    phone,
    lines: lines.length ? lines : DEFAULT_ISSUER.lines,
  };
}

export function resolveInvoiceBanking(
  organisation: Pick<Organisation, "settings">
): InvoiceBankingProfile {
  return pickProfile(organisation.settings?.invoice_banking, DEFAULT_BANKING, [
    "bank",
    "accountName",
    "accountNumber",
    "branchCode",
    "accountType",
  ]);
}

export function resolveInvoiceFooter(
  organisation: Pick<Organisation, "settings">
): InvoiceFooterProfile {
  return pickProfile(organisation.settings?.invoice_footer, DEFAULT_FOOTER, [
    "name",
    "phone",
    "email",
  ]);
}

/** Bill-to block from company record — do not invent missing address lines. */
export function resolveInvoiceBillTo(
  company: Pick<Company, "name" | "address" | "contact_phone"> | null | undefined
): InvoiceBillToProfile {
  if (!company) {
    return { name: "", lines: [], phone: "" };
  }
  const lines = company.address
    ? company.address
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
  return {
    name: company.name ?? "",
    lines,
    phone: company.contact_phone?.trim() ?? "",
  };
}
