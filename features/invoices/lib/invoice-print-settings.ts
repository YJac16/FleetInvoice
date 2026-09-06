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

export type InvoiceContactSettings = {
  name?: string;
  phone?: string;
  email?: string;
};

export type InvoicePrintSettings = {
  supplier?: InvoiceSupplierSettings;
  banking?: InvoiceBankingSettings;
  contact?: InvoiceContactSettings;
  /** Shown as DRIVER: {label} when set; otherwise derived from trip assignments */
  driver_label?: string;
};

const DEFAULT_BANKING: InvoiceBankingSettings = {
  bank: "FNB",
  account_name: "Yaseen Jacobs",
  account_number: "62731713170",
  branch_code: "250655",
  account_type: "Cheque Account",
};

const DEFAULT_CONTACT: InvoiceContactSettings = {
  name: "Yaseen Jacobs",
  phone: "082 327 7446",
  email: "yaseenjacobs97@gmail.com",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSupplier(
  supplierRaw: Record<string, unknown>,
  organisationName: string
): InvoiceSupplierSettings {
  const addressLines = Array.isArray(supplierRaw.address_lines)
    ? supplierRaw.address_lines.filter(
        (line): line is string => typeof line === "string" && line.trim().length > 0
      )
    : undefined;

  return {
    name:
      (typeof supplierRaw.name === "string" && supplierRaw.name.trim()) ||
      organisationName,
    address_lines: addressLines,
    phone:
      typeof supplierRaw.phone === "string" ? supplierRaw.phone : undefined,
    email:
      typeof supplierRaw.email === "string" ? supplierRaw.email : undefined,
  };
}

function parseBanking(bankingRaw: Record<string, unknown>): InvoiceBankingSettings {
  return {
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
  };
}

function parseContact(contactRaw: Record<string, unknown>): InvoiceContactSettings {
  return {
    name: typeof contactRaw.name === "string" ? contactRaw.name : undefined,
    phone: typeof contactRaw.phone === "string" ? contactRaw.phone : undefined,
    email: typeof contactRaw.email === "string" ? contactRaw.email : undefined,
  };
}

function hasBankingDetails(banking: InvoiceBankingSettings): boolean {
  return Boolean(
    banking.bank ||
      banking.account_name ||
      banking.account_number ||
      banking.branch_code ||
      banking.account_type
  );
}

function hasContactDetails(contact: InvoiceContactSettings): boolean {
  return Boolean(contact.name || contact.phone || contact.email);
}

function mergeBanking(
  ...sources: (InvoiceBankingSettings | undefined)[]
): InvoiceBankingSettings {
  const merged: InvoiceBankingSettings = {};
  for (const source of sources) {
    if (!source) continue;
    merged.bank ??= source.bank;
    merged.account_name ??= source.account_name;
    merged.account_number ??= source.account_number;
    merged.branch_code ??= source.branch_code;
    merged.account_type ??= source.account_type;
  }
  return merged;
}

function mergeContact(
  ...sources: (InvoiceContactSettings | undefined)[]
): InvoiceContactSettings {
  const merged: InvoiceContactSettings = {};
  for (const source of sources) {
    if (!source) continue;
    merged.name ??= source.name;
    merged.phone ??= source.phone;
    merged.email ??= source.email;
  }
  return merged;
}

export function parseInvoicePrintSettings(
  organisation: Pick<Organisation, "name" | "settings">
): InvoicePrintSettings {
  const invoicePrintRaw = organisation.settings?.invoice_print;
  const invoiceRaw = organisation.settings?.invoice;

  const printRecord = isRecord(invoicePrintRaw) ? invoicePrintRaw : null;
  const invoiceRecord = isRecord(invoiceRaw) ? invoiceRaw : null;

  const supplierRaw = isRecord(invoiceRecord?.supplier)
    ? invoiceRecord.supplier
    : isRecord(printRecord?.contact)
      ? printRecord.contact
      : {};

  const bankingFromPrint = printRecord && isRecord(printRecord.banking)
    ? parseBanking(printRecord.banking)
    : undefined;
  const bankingFromInvoice = invoiceRecord && isRecord(invoiceRecord.banking)
    ? parseBanking(invoiceRecord.banking)
    : undefined;

  const contactFromPrint = printRecord && isRecord(printRecord.contact)
    ? parseContact(printRecord.contact)
    : undefined;
  const contactFromSupplier = parseContact({
    name: typeof supplierRaw.name === "string" ? supplierRaw.name : undefined,
    phone: typeof supplierRaw.phone === "string" ? supplierRaw.phone : undefined,
    email: typeof supplierRaw.email === "string" ? supplierRaw.email : undefined,
  });

  const bankingMerged = mergeBanking(bankingFromPrint, bankingFromInvoice);
  const banking = hasBankingDetails(bankingMerged)
    ? bankingMerged
    : DEFAULT_BANKING;

  const contactMerged = mergeContact(contactFromPrint, contactFromSupplier);
  const contact = hasContactDetails(contactMerged)
    ? contactMerged
    : DEFAULT_CONTACT;

  const driverLabel =
    (invoiceRecord && typeof invoiceRecord.driver_label === "string"
      ? invoiceRecord.driver_label
      : undefined) ??
    (printRecord && typeof printRecord.driver_label === "string"
      ? printRecord.driver_label
      : undefined);

  if (!invoiceRecord && !printRecord) {
    return {
      supplier: { name: organisation.name },
      banking,
      contact,
    };
  }

  return {
    supplier: parseSupplier(supplierRaw, organisation.name),
    banking,
    contact,
    driver_label: driverLabel,
  };
}
