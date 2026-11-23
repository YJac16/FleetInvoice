"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";

import { TextAreaField, TextField } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSupplierAction } from "@/features/maintenance/actions";
import {
  EMPTY_SUPPLIER,
  supplierFormSchema,
  type SupplierFormValues,
} from "@/features/maintenance/schemas/supplier";

export function SupplierFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: EMPTY_SUPPLIER,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const result = await createSupplierAction(values);
      if (!result.ok) {
        for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(path as FieldPath<SupplierFormValues>, { message });
        }
        toast.error(result.message);
        return;
      }
      toast.success("Supplier added");
      form.reset(EMPTY_SUPPLIER);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  });

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add supplier
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <TextField control={form.control} name="name" label="Name" autoComplete="organization" />
            <TextField control={form.control} name="vat_number" label="VAT number (optional)" autoComplete="off" />
            <TextField control={form.control} name="contact_phone" label="Phone (optional)" type="tel" autoComplete="tel" />
            <TextField control={form.control} name="email" label="Email (optional)" type="email" autoComplete="email" />
            <TextAreaField control={form.control} name="notes" label="Notes (optional)" />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? "Saving…" : "Save supplier"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
