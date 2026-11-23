import { z } from "zod";

/** Sentinel for "no vehicle" / "no category" in selects (Base UI selects
 *  can't hold an empty-string item). Mapped to null in the payload. */
export const NONE_OPTION = "__none__";

/** Rate a brand-new bill starts with. An existing bill always keeps the
 *  rate it was saved with (see billToFormValues). */
export const DEFAULT_VAT_RATE = "15";

const DECIMAL_2 = /^\d+(\.\d{1,2})?$/;
const DECIMAL_3 = /^\d+(\.\d{1,3})?$/;
const WHOLE = /^\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INT = 2_147_483_647;

const optionalId = z
  .string()
  .trim()
  .refine((v) => v === "" || v === NONE_OPTION || UUID.test(v), "Invalid selection");

export const billLineSchema = z.object({
  category_id: optionalId,
  description: z.string().trim().min(1, "Description is required").max(500, "Too long"),
  quantity: z
    .string()
    .trim()
    .regex(DECIMAL_3, "Enter a quantity, up to 3 decimals")
    .refine((v) => Number(v) > 0, "Quantity must be more than 0")
    .refine((v) => Number(v) < 1_000_000_000, "Quantity is too large"),
  unit_amount: z
    .string()
    .trim()
    .regex(DECIMAL_2, "Enter an amount, up to 2 decimals")
    .refine((v) => Number(v) < 1_000_000_000_000, "Amount is too large"),
  vat_applicable: z.boolean(),
});

export const billFormSchema = z.object({
  supplier_id: z.string().trim().regex(UUID, "Select a supplier"),
  vehicle_id: optionalId,
  bill_date: z
    .string()
    .trim()
    .regex(ISO_DATE, "Bill date is required")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Invalid date"),
  invoice_ref: z.string().trim().min(1, "Supplier invoice number is required").max(100, "Too long"),
  vat_mode: z.enum(["exclusive", "inclusive"]),
  // Required on every save: the RPC falls back to 15 when vat_rate is
  // missing, which would silently re-rate a 0% or custom-rate bill on edit.
  vat_rate: z
    .string()
    .trim()
    .min(1, "VAT rate is required")
    .regex(DECIMAL_2, "Enter a rate, up to 2 decimals")
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, "VAT rate must be 0 to 100"),
  // Optional reading, stored only as typed. Blank means none.
  odometer_km: z
    .string()
    .trim()
    .refine((v) => v === "" || WHOLE.test(v), "Whole kilometres only")
    .refine((v) => v === "" || Number(v) <= MAX_INT, "Odometer is too large"),
  notes: z.string().max(2000, "Too long"),
  lines: z.array(billLineSchema).max(200, "Too many lines"),
});

export type BillLineFormValues = z.infer<typeof billLineSchema>;
export type BillFormValues = z.infer<typeof billFormSchema>;

export function emptyBillLine(): BillLineFormValues {
  return { category_id: NONE_OPTION, description: "", quantity: "1", unit_amount: "", vat_applicable: true };
}
