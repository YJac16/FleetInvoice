import type { Organisation } from "@/types";

export type InvoicePrintSettingsFormValues = {
  supplier_name: string;
  supplier_address: string;
  supplier_phone: string;
  supplier_email: string;
  bank: string;
  account_name: string;
  account_number: string;
  branch_code: string;
  account_type: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  vehicle_reg: string;
  driver_label: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function invoicePrintSettingsFromOrganisation(
  organisation: Pick<Organisation, "name" | "settings">
): InvoicePrintSettingsFormValues {
  const invoicePrintRaw = organisation.settings?.invoice_print;
  const invoiceRaw = organisation.settings?.invoice;
  const printRecord = isRecord(invoicePrintRaw) ? invoicePrintRaw : {};
  const invoiceRecord = isRecord(invoiceRaw) ? invoiceRaw : {};
  const supplierRaw = isRecord(invoiceRecord.supplier) ? invoiceRecord.supplier : {};
  const bankingRaw = isRecord(printRecord.banking) ? printRecord.banking : {};
  const contactRaw = isRecord(printRecord.contact) ? printRecord.contact : {};

  const addressLines = Array.isArray(supplierRaw.address_lines)
    ? supplierRaw.address_lines.filter(
        (line): line is string => typeof line === "string" && line.trim().length > 0
      )
    : [];

  return {
    supplier_name: readString(supplierRaw, "name") || organisation.name,
    supplier_address: addressLines.join("\n"),
    supplier_phone: readString(supplierRaw, "phone"),
    supplier_email: readString(supplierRaw, "email"),
    bank: readString(bankingRaw, "bank"),
    account_name: readString(bankingRaw, "account_name"),
    account_number: readString(bankingRaw, "account_number"),
    branch_code: readString(bankingRaw, "branch_code"),
    account_type: readString(bankingRaw, "account_type"),
    contact_name: readString(contactRaw, "name"),
    contact_phone: readString(contactRaw, "phone"),
    contact_email: readString(contactRaw, "email"),
    vehicle_reg:
      readString(printRecord, "vehicle_reg") ||
      readString(invoiceRecord, "vehicle_reg"),
    driver_label:
      readString(printRecord, "driver_label") ||
      readString(invoiceRecord, "driver_label"),
  };
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function invoicePrintSettingsToOrganisationSettings(
  values: InvoicePrintSettingsFormValues,
  existingSettings: Record<string, unknown> = {}
): Record<string, unknown> {
  const next = { ...existingSettings };
  const addressLines = values.supplier_address
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const supplier = {
    ...(trimOrUndefined(values.supplier_name)
      ? { name: values.supplier_name.trim() }
      : {}),
    ...(addressLines.length > 0 ? { address_lines: addressLines } : {}),
    ...(trimOrUndefined(values.supplier_phone)
      ? { phone: values.supplier_phone.trim() }
      : {}),
    ...(trimOrUndefined(values.supplier_email)
      ? { email: values.supplier_email.trim() }
      : {}),
  };

  const banking = {
    ...(trimOrUndefined(values.bank) ? { bank: values.bank.trim() } : {}),
    ...(trimOrUndefined(values.account_name)
      ? { account_name: values.account_name.trim() }
      : {}),
    ...(trimOrUndefined(values.account_number)
      ? { account_number: values.account_number.trim() }
      : {}),
    ...(trimOrUndefined(values.branch_code)
      ? { branch_code: values.branch_code.trim() }
      : {}),
    ...(trimOrUndefined(values.account_type)
      ? { account_type: values.account_type.trim() }
      : {}),
  };

  const contact = {
    ...(trimOrUndefined(values.contact_name)
      ? { name: values.contact_name.trim() }
      : {}),
    ...(trimOrUndefined(values.contact_phone)
      ? { phone: values.contact_phone.trim() }
      : {}),
    ...(trimOrUndefined(values.contact_email)
      ? { email: values.contact_email.trim() }
      : {}),
  };

  const invoicePrint: Record<string, unknown> = {
    ...(Object.keys(banking).length > 0 ? { banking } : {}),
    ...(Object.keys(contact).length > 0 ? { contact } : {}),
    ...(trimOrUndefined(values.vehicle_reg)
      ? { vehicle_reg: values.vehicle_reg.trim() }
      : {}),
    ...(trimOrUndefined(values.driver_label)
      ? { driver_label: values.driver_label.trim() }
      : {}),
  };

  if (Object.keys(supplier).length > 0) {
    next.invoice = {
      ...(isRecord(next.invoice) ? next.invoice : {}),
      supplier,
      ...(trimOrUndefined(values.driver_label)
        ? { driver_label: values.driver_label.trim() }
        : {}),
      ...(trimOrUndefined(values.vehicle_reg)
        ? { vehicle_reg: values.vehicle_reg.trim() }
        : {}),
    };
  }

  if (Object.keys(invoicePrint).length > 0) {
    next.invoice_print = invoicePrint;
  } else {
    delete next.invoice_print;
  }

  return next;
}
