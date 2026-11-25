import {
  PRINT_OWNER_KEYS,
  parseOwnerInvoicePrintOverride,
  type DriverInvoicePrintOverride,
  type PrintOwnerKey,
} from "@/features/invoices/lib/invoice-print-settings";
import type { Organisation } from "@/types";

export type OwnerPrintForm = {
  issuer_name: string;
  bank: string;
  account_name: string;
  account_number: string;
  branch_code: string;
  account_type: string;
};

export const EMPTY_OWNER_PRINT_FORM: OwnerPrintForm = {
  issuer_name: "",
  bank: "",
  account_name: "",
  account_number: "",
  branch_code: "",
  account_type: "",
};

export function ownerBlockToForm(
  organisation: Pick<Organisation, "settings">,
  owner: PrintOwnerKey
): OwnerPrintForm {
  const o = parseOwnerInvoicePrintOverride(organisation, owner);
  return {
    issuer_name: o?.supplier?.name ?? o?.contact?.name ?? "",
    bank: o?.banking?.bank ?? "",
    account_name: o?.banking?.account_name ?? "",
    account_number: o?.banking?.account_number ?? "",
    branch_code: o?.banking?.branch_code ?? "",
    account_type: o?.banking?.account_type ?? "",
  };
}

function t(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/** Empty form -> null (owner falls back to the org issuer). */
export function ownerBlockFromForm(
  form: OwnerPrintForm | undefined
): DriverInvoicePrintOverride | null {
  if (!form) return null;
  const banking = Object.fromEntries(
    Object.entries({
      bank: t(form.bank),
      account_name: t(form.account_name),
      account_number: t(form.account_number),
      branch_code: t(form.branch_code),
      account_type: t(form.account_type),
    }).filter(([, v]) => v !== undefined)
  );
  const name = t(form.issuer_name);
  const block: DriverInvoicePrintOverride = {};
  if (name) block.supplier = { name };
  if (Object.keys(banking).length > 0) block.banking = banking;
  return Object.keys(block).length > 0 ? block : null;
}

/** Writes (or removes) settings.invoice_print.owners[owner], leaving the rest intact. */
export function setOwnerBlock(
  settings: Record<string, unknown>,
  owner: PrintOwnerKey,
  block: DriverInvoicePrintOverride | null
): Record<string, unknown> {
  const print =
    typeof settings.invoice_print === "object" && settings.invoice_print !== null
      ? { ...(settings.invoice_print as Record<string, unknown>) }
      : {};
  const owners = {
    ...((typeof print.owners === "object" && print.owners !== null
      ? print.owners
      : {}) as Record<string, unknown>),
  };
  if (block) owners[owner] = block;
  else delete owners[owner];
  if (Object.keys(owners).length > 0) print.owners = owners;
  else delete print.owners;
  const next = { ...settings };
  if (Object.keys(print).length > 0) next.invoice_print = print;
  else delete next.invoice_print;
  return next;
}

export { PRINT_OWNER_KEYS };
