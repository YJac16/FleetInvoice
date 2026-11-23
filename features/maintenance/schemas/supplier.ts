import { z } from "zod";

export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Too long"),
  vat_number: z.string().trim().max(50, "Too long"),
  contact_phone: z.string().trim().max(50, "Too long"),
  email: z
    .string()
    .trim()
    .max(200, "Too long")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
  notes: z.string().trim().max(2000, "Too long"),
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const EMPTY_SUPPLIER: SupplierFormValues = {
  name: "",
  vat_number: "",
  contact_phone: "",
  email: "",
  notes: "",
};
