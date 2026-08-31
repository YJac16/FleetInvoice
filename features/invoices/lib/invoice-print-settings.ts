import type { Organisation } from "@/types";

export type InvoiceSupplierSettings = {
  name?: string;
  address_lines?: string[];
  phone?: string;
  email?: string;
};

export type InvoiceBankingSettings = {
  bank?: string;
  account_name?: string;
  account_number?: string;
  branch_code?: string;
  account_type?: string;
};

export type InvoicePrintSettings = {
  supplier?: InvoiceSupplierSettings;
  banking?: InvoiceBankingSettings;
  /** Shown as DRIVER: {label} when set; otherwise derived from trip assignments */
  driver_label?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseInvoicePrintSettings(
  organisation: Pick<Organisation, "name" | "settings">
): InvoicePrintSettings {
  const raw = organisation.settings?.invoice;
  if (!isRecord(raw)) return { supplier: { name: organisation.name } };

  const supplierRaw = isRecord(raw.supplier) ? raw.supplier : {};
  const bankingRaw = isRecord(raw.banking) ? raw.banking : {};

  const addressLines = Array.isArray(supplierRaw.address_lines)
    ? supplierRaw.address_lines.filter(
        (line): line is string => typeof line === "string" && line.trim().length > 0
      )
    : undefined;

  return {
    supplier: {
      name:
        (typeof supplierRaw.name === "string" && supplierRaw.name.trim()) ||
        organisation.name,
      address_lines: addressLines,
      phone:
        typeof supplierRaw.phone === "string" ? supplierRaw.phone : undefined,
      email:
        typeof supplierRaw.email === "string" ? supplierRaw.email : undefined,
    },
    banking: {
      bank: typeof bankingRaw.bank === "string" ? bankingRaw.bank : undefined,
      account_name:
        typeof bankingRaw.account_name === "string"
          ? bankingRaw.account_name
          : undefined,
      account_number:
        typeof bankingRaw.account_number === "string"
          ? bankingRaw.account_number
          : undefined,
      branch_code:
        typeof bankingRaw.branch_code === "string"
          ? bankingRaw.branch_code
          : undefined,
      account_type:
        typeof bankingRaw.account_type === "string"
          ? bankingRaw.account_type
          : undefined,
    },
    driver_label:
      typeof raw.driver_label === "string" ? raw.driver_label : undefined,
  };
}
