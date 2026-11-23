"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";

import { SelectField, TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";
import { saveWorkshopBillAction } from "@/features/maintenance/actions";
import { BillTotals } from "@/features/maintenance/components/bill-lines-view";
import { computeLineVat, formatVatRate, previewNumber, sumLineVat } from "@/features/maintenance/lib/vat";
import {
  NONE_OPTION,
  billFormSchema,
  emptyBillLine,
  type BillFormValues,
} from "@/features/maintenance/schemas/workshop-bill";
import type { BillFormOptions } from "@/features/maintenance/types";

const VAT_MODE_OPTIONS = [
  { value: "exclusive", label: "Amounts exclude VAT" },
  { value: "inclusive", label: "Amounts include VAT" },
];

type Props = {
  /** null when creating. */
  billId: string | null;
  defaultValues: BillFormValues;
  options: BillFormOptions;
};

export function BillForm({ billId, defaultValues, options }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const form = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues,
    mode: "onTouched",
  });
  const { control, handleSubmit, setError } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const lines = useWatch({ control, name: "lines" }) ?? [];
  const vatMode = useWatch({ control, name: "vat_mode" });
  const vatRateText = useWatch({ control, name: "vat_rate" });
  const rate = previewNumber(vatRateText);
  const previews = lines.map((line) =>
    computeLineVat({
      quantity: previewNumber(line?.quantity),
      unitAmount: previewNumber(line?.unit_amount),
      vatApplicable: line?.vat_applicable ?? true,
      mode: vatMode,
      rate,
    })
  );
  const totals = sumLineVat(previews);

  const vehicleOptions = [{ value: NONE_OPTION, label: "No vehicle" }, ...options.vehicles];
  const categoryOptions = [{ value: NONE_OPTION, label: "No category" }, ...options.categories];
  const showCategories = options.categories.length > 0;

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true);
    try {
      const result = await saveWorkshopBillAction(billId, values);
      if (!result.ok) {
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(path as FieldPath<BillFormValues>, { message });
        }
        toast.error(result.message);
        return;
      }
      toast.success(billId ? "Bill updated" : "Bill saved");
      router.push(`/maintenance/bills/${result.id}`);
      router.refresh();
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  });

  const cancelHref = billId ? `/maintenance/bills/${billId}` : "/maintenance/bills";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 pb-4">
      <section className="space-y-4 rounded-2xl border bg-card p-4" aria-label="Bill details">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <SelectField control={control} name="supplier_id" label="Supplier" options={options.suppliers} placeholder="Select supplier" />
            {options.suppliers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No suppliers yet.{" "}
                <Link href="/maintenance/suppliers" className="text-primary underline-offset-4 hover:underline">
                  Add a supplier
                </Link>{" "}
                first.
              </p>
            ) : null}
          </div>
          <TextField control={control} name="invoice_ref" label="Supplier invoice number" autoComplete="off" />
          <TextField control={control} name="bill_date" label="Bill date" type="date" />
          <SelectField control={control} name="vehicle_id" label="Vehicle (optional)" options={vehicleOptions} placeholder="No vehicle" />
          <SelectField control={control} name="vat_mode" label="Line amounts" options={VAT_MODE_OPTIONS} />
          <TextField control={control} name="vat_rate" label="VAT rate (%)" type="number" />
          <TextField control={control} name="odometer_km" label="Odometer km (optional)" type="number" />
        </div>
        <TextAreaField control={control} name="notes" label="Notes (optional)" />
      </section>

      <section className="space-y-3" aria-labelledby="bill-form-lines-heading">
        <h2 id="bill-form-lines-heading" className="text-base font-medium">Lines</h2>
        {fields.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No lines yet. A draft can be saved without lines.
          </p>
        ) : null}
        <ol className="space-y-3">
          {fields.map((field, index) => {
            const preview = previews[index] ?? { excl: 0, vat: 0, incl: 0 };
            return (
              <li key={field.id} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Line {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <TextField control={control} name={`lines.${index}.description`} label="Description" autoComplete="off" />
                <div className="grid grid-cols-2 gap-3">
                  <TextField control={control} name={`lines.${index}.quantity`} label="Qty" type="number" />
                  <TextField
                    control={control}
                    name={`lines.${index}.unit_amount`}
                    label={vatMode === "inclusive" ? "Unit (incl.)" : "Unit (excl.)"}
                    type="number"
                  />
                </div>
                {showCategories ? (
                  <SelectField
                    control={control}
                    name={`lines.${index}.category_id`}
                    label="Category (optional)"
                    options={categoryOptions}
                    placeholder="No category"
                  />
                ) : null}
                <Controller
                  control={control}
                  name={`lines.${index}.vat_applicable`}
                  render={({ field: f }) => (
                    <label className="flex min-h-9 items-center gap-3 text-sm">
                      <Checkbox checked={f.value} onCheckedChange={(checked) => f.onChange(Boolean(checked))} />
                      VAT applies to this line
                    </label>
                  )}
                />
                <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-sm tabular-nums" aria-label={`Line ${index + 1} amounts`}>
                  <div>
                    <dt className="text-xs text-muted-foreground">Excl.</dt>
                    <dd>{formatZarAmount(preview.excl)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">VAT</dt>
                    <dd>{formatZarAmount(preview.vat)}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs text-muted-foreground">Incl.</dt>
                    <dd className="font-medium">{formatZarAmount(preview.incl)}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
        <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={() => append(emptyBillLine())}>
          <Plus className="size-4" /> Add line
        </Button>
        <BillTotals excl={totals.excl} vat={totals.vat} incl={totals.incl} vatLabel={`VAT (${formatVatRate(rate)})`} />
        <p className="text-xs text-muted-foreground">Totals are worked out again on the server when you save.</p>
      </section>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <span className="mr-auto text-sm font-medium tabular-nums sm:hidden">{formatZarAmount(totals.incl)}</span>
        <Button variant="outline" size="lg" render={<Link href={cancelHref} />}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving…" : billId ? "Save changes" : "Save bill"}
        </Button>
      </div>
    </form>
  );
}
