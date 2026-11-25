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
  /** Own line under DRIVER: `REG NO: {value}` — vehicle registration, not company code */
  vehicle_reg?: string;
  /** Own line above REG NO: `DRIVER: {label}` when set; otherwise derived from trip assignments */
  driver_label?: string;
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

/** Supplier letterhead for print — never the SaaS org name when personal contact is configured. */
export function resolvePrintSupplierName(
  printSettings: InvoicePrintSettings,
  organisationName: string
): string {
  const supplierName = printSettings.supplier?.name?.trim();
  if (supplierName && supplierName !== organisationName) {
    return supplierName;
  }

  const contactName = printSettings.contact?.name?.trim();
  if (contactName) return contactName;

  const accountName = printSettings.banking?.account_name?.trim();
  if (accountName) return accountName;

  return supplierName || organisationName;
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
  const banking = hasBankingDetails(bankingMerged) ? bankingMerged : {};

  const contactMerged = mergeContact(contactFromPrint, contactFromSupplier);
  const contact = hasContactDetails(contactMerged) ? contactMerged : {};

  const driverLabel =
    (invoiceRecord && typeof invoiceRecord.driver_label === "string"
      ? invoiceRecord.driver_label
      : undefined) ??
    (printRecord && typeof printRecord.driver_label === "string"
      ? printRecord.driver_label
      : undefined);

  const vehicleReg =
    (printRecord && typeof printRecord.vehicle_reg === "string"
      ? printRecord.vehicle_reg
      : undefined) ??
    (invoiceRecord && typeof invoiceRecord.vehicle_reg === "string"
      ? invoiceRecord.vehicle_reg
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
    vehicle_reg: vehicleReg,
    driver_label: driverLabel,
  };
}

/**
 * Per-driver invoice issuer override (table driver_invoice_print_overrides,
 * migration 00089). Same block shape as the org's settings.invoice_print.
 */
export type DriverInvoicePrintOverride = {
  supplier?: InvoiceSupplierSettings;
  contact?: InvoiceContactSettings;
  banking?: InvoiceBankingSettings;
};

function hasSupplierDetails(supplier: InvoiceSupplierSettings): boolean {
  return Boolean(
    supplier.name?.trim() ||
      supplier.phone ||
      supplier.email ||
      (supplier.address_lines && supplier.address_lines.length > 0)
  );
}

/** Parses the override row's settings; returns null when it carries nothing printable. */
export function parseDriverInvoicePrintOverride(
  raw: unknown
): DriverInvoicePrintOverride | null {
  if (!isRecord(raw)) return null;

  const contact = isRecord(raw.contact) ? parseContact(raw.contact) : undefined;
  const supplierParsed = isRecord(raw.supplier)
    ? parseSupplier(raw.supplier, "")
    : undefined;
  const supplier =
    supplierParsed && hasSupplierDetails(supplierParsed)
      ? { ...supplierParsed, name: supplierParsed.name || undefined }
      : undefined;
  const banking = isRecord(raw.banking) ? parseBanking(raw.banking) : undefined;

  const result: DriverInvoicePrintOverride = {};
  if (supplier) result.supplier = supplier;
  if (contact && hasContactDetails(contact)) result.contact = contact;
  if (banking && hasBankingDetails(banking)) result.banking = banking;

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Applies a driver's override on top of the org print settings.
 *
 * Fallback is per block, not per field, so an invoice never mixes two
 * parties' details (e.g. one issuer's account name over another's account
 * number):
 *  - banking: override banking replaces the org banking when present.
 *  - issuer (letterhead + contact): an override supplier or contact replaces
 *    both org supplier and org contact.
 * Any block the override omits falls back to the org settings. Driver label
 * and vehicle registration always come from the org/trips as today.
 */
export function applyDriverInvoicePrintOverride(
  base: InvoicePrintSettings,
  override: DriverInvoicePrintOverride | null | undefined
): InvoicePrintSettings {
  if (!override) return base;

  const next: InvoicePrintSettings = { ...base };

  if (override.banking && hasBankingDetails(override.banking)) {
    next.banking = { ...override.banking };
  }

  const ovContact =
    override.contact && hasContactDetails(override.contact)
      ? override.contact
      : undefined;
  const ovSupplier =
    override.supplier && hasSupplierDetails(override.supplier)
      ? override.supplier
      : undefined;

  if (ovContact || ovSupplier) {
    const issuerName =
      ovSupplier?.name?.trim() ||
      ovContact?.name?.trim() ||
      next.banking?.account_name?.trim() ||
      undefined;
    next.supplier = {
      name: issuerName,
      address_lines: ovSupplier?.address_lines,
      phone: ovSupplier?.phone ?? ovContact?.phone,
      email: ovSupplier?.email ?? ovContact?.email,
    };
    next.contact = ovContact
      ? { ...ovContact }
      : { name: issuerName, phone: ovSupplier?.phone, email: ovSupplier?.email };
  }

  return next;
}

/** Owners that can carry their own issuer block in settings.invoice_print.owners. */
export const PRINT_OWNER_KEYS = ["yaseen", "fadia"] as const;
export type PrintOwnerKey = (typeof PRINT_OWNER_KEYS)[number];

/** Reads settings.invoice_print.owners.{yaseen|fadia}; null when unset or empty. */
export function parseOwnerInvoicePrintOverride(
  organisation: Pick<Organisation, "settings">,
  owner: string | null | undefined
): DriverInvoicePrintOverride | null {
  if (!owner || !(PRINT_OWNER_KEYS as readonly string[]).includes(owner)) return null;
  const printRaw = organisation.settings?.invoice_print;
  if (!isRecord(printRaw) || !isRecord(printRaw.owners)) return null;
  return parseDriverInvoicePrintOverride(printRaw.owners[owner]);
}

/**
 * Issuer for one invoice. Precedence (block-level, never mixing parties):
 * driver override > owner block (when owner_tag is set) > the invoice's own
 * organisation settings. Unassigned invoices use the org issuer.
 */
export function resolveInvoicePrintSettings(
  organisation: Pick<Organisation, "name" | "settings">,
  owner: string | null | undefined,
  driverOverride: DriverInvoicePrintOverride | null | undefined
): InvoicePrintSettings {
  const base = parseInvoicePrintSettings(organisation);
  const withOwner = applyDriverInvoicePrintOverride(
    base,
    parseOwnerInvoicePrintOverride(organisation, owner)
  );
  return applyDriverInvoicePrintOverride(withOwner, driverOverride);
}
