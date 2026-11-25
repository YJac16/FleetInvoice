"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildDriverInvoicePrintOverride,
  overrideToIssuerForm,
  EMPTY_ISSUER_FORM,
  type IssuerForm,
} from "@/features/drivers/lib/invoice-issuer-form";
import {
  getDriverInvoicePrintOverride,
  setDriverInvoicePrintOverride,
} from "@/services/driver-invoice-print-override.service";
import type { Driver } from "@/types";
import { getErrorMessage } from "@/utils/errors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisationId: string;
  driver: Driver | null;
};

const SECTIONS: Array<{
  title: string;
  fields: Array<{ key: keyof IssuerForm; label: string; placeholder?: string }>;
}> = [
  {
    title: "Supplier (letterhead)",
    fields: [
      { key: "supplier_name", label: "Issuer name" },
      { key: "supplier_address", label: "Address lines", placeholder: "One line per comma" },
      { key: "supplier_phone", label: "Phone" },
      { key: "supplier_email", label: "Email" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "contact_name", label: "Contact name" },
      { key: "contact_phone", label: "Contact phone" },
      { key: "contact_email", label: "Contact email" },
    ],
  },
  {
    title: "Banking",
    fields: [
      { key: "bank", label: "Bank" },
      { key: "account_name", label: "Account name" },
      { key: "account_number", label: "Account number" },
      { key: "branch_code", label: "Branch code" },
      { key: "account_type", label: "Account type" },
    ],
  },
];

/**
 * Per-driver invoice issuer (00089 driver_invoice_print_overrides). Only
 * rendered for org admins (invoices:manage + drivers:manage); the RPC also
 * refuses anyone but organisation_admin. Banking values are never logged:
 * no console output, and the audit row only names the changed blocks.
 */
export function DriverInvoiceIssuerDialog({ open, onOpenChange, organisationId, driver }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<IssuerForm>(EMPTY_ISSUER_FORM);
  const queryKey = ["driver-invoice-print-override", organisationId, driver?.id ?? "none"];

  const overrideQuery = useQuery({
    queryKey,
    queryFn: () => getDriverInvoicePrintOverride(organisationId, driver!.id),
    enabled: open && Boolean(driver),
  });

  useEffect(() => {
    if (open) setForm(overrideToIssuerForm(overrideQuery.data ?? null));
  }, [open, overrideQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (clear: boolean) => {
      if (!driver) return;
      await setDriverInvoicePrintOverride(driver.id, clear ? null : buildDriverInvoicePrintOverride(form));
    },
    onSuccess: async (_data, clear) => {
      toast.success(clear ? "Invoice issuer cleared" : "Invoice issuer saved");
      await queryClient.invalidateQueries({ queryKey: ["driver-invoice-print-override", organisationId] });
      onOpenChange(false);
    },
    // Error text comes from the RPC (role / shape checks), never field values.
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invoice issuer"
      description={
        driver
          ? `Who ${driver.full_name}'s weekly invoices are issued from. Blank blocks fall back to the organisation's invoice settings.`
          : undefined
      }
      footer={
        <div className="flex w-full flex-col gap-2 px-4 pb-4 sm:flex-row">
          <Button
            className="flex-1"
            disabled={saveMutation.isPending || overrideQuery.isLoading}
            onClick={() => saveMutation.mutate(false)}
          >
            {saveMutation.isPending ? "Saving…" : "Save issuer"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={saveMutation.isPending || !overrideQuery.data}
            onClick={() => saveMutation.mutate(true)}
          >
            Clear override
          </Button>
        </div>
      }
    >
      {overrideQuery.isError ? (
        <p className="text-sm text-destructive">{getErrorMessage(overrideQuery.error)}</p>
      ) : null}
      {SECTIONS.map((section) => (
        <fieldset key={section.title} className="space-y-2">
          <legend className="text-sm font-medium">{section.title}</legend>
          {section.fields.map((field) => {
            const inputId = `issuer-${field.key}`;
            return (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={inputId}>{field.label}</Label>
                <Input
                  id={inputId}
                  value={form[field.key]}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                />
              </div>
            );
          })}
        </fieldset>
      ))}
    </FormDialog>
  );
}
