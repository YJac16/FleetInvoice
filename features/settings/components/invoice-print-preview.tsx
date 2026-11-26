"use client";

import {
  InvoicePrintBankingBlock,
  InvoicePrintContactBlock,
  InvoicePrintSupplierBlock,
} from "@/features/invoices/components/invoice-print-view";
import type { InvoicePrintSettingsFormValues } from "@/features/settings/lib/invoice-print-settings-form";

const clean = (v: string) => v.trim() || undefined;

/** Live preview of the invoice header and footer, built from the unsaved form. */
export function InvoicePrintPreview({
  values,
  logoUrl,
  organisationName,
}: {
  values: InvoicePrintSettingsFormValues;
  logoUrl?: string | null;
  organisationName: string;
}) {
  const supplier = {
    name: clean(values.supplier_name) ?? organisationName,
    address_lines: values.supplier_address
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean),
    phone: clean(values.supplier_phone),
  };
  const banking = {
    bank: clean(values.bank),
    account_name: clean(values.account_name),
    account_number: clean(values.account_number),
    branch_code: clean(values.branch_code),
    account_type: clean(values.account_type),
  };
  const contact = {
    name: clean(values.contact_name),
    phone: clean(values.contact_phone),
    email: clean(values.contact_email),
  };

  return (
    <aside
      aria-label="Invoice print preview"
      data-testid="invoice-print-preview"
      className="space-y-3 lg:sticky lg:top-20"
    >
      <p className="text-sm font-medium">Preview</p>
      <div className="space-y-5 rounded-xl border border-border bg-background p-4 text-sm">
        <div className="border-b border-black/20 pb-3">
          <InvoicePrintSupplierBlock
            logoUrl={logoUrl}
            logoAlt={organisationName}
            supplier={supplier}
          />
        </div>
        <InvoicePrintBankingBlock banking={banking} />
        <InvoicePrintContactBlock contact={contact} />
      </div>
      <p className="text-xs text-muted-foreground">
        Updates as you type. Save to apply it to printed invoices.
      </p>
    </aside>
  );
}
