import {
  DEFAULT_VAT_RATE,
  NONE_OPTION,
  emptyBillLine,
  type BillFormValues,
} from "@/features/maintenance/schemas/workshop-bill";
import type { BillDetail } from "@/features/maintenance/types";

/** Payload for public.save_workshop_bill (00074). */
export type WorkshopBillPayload = {
  supplier_id: string;
  vehicle_id: string | null;
  bill_date: string;
  invoice_ref: string;
  vat_mode: "exclusive" | "inclusive";
  vat_rate: number;
  odometer_km: number | null;
  notes: string | null;
  lines: Array<{
    category_id: string | null;
    description: string;
    quantity: number;
    unit_amount: number;
    vat_applicable: boolean;
    sort_order: number;
  }>;
};

function idOrNull(value: string): string | null {
  const v = value.trim();
  return v === "" || v === NONE_OPTION ? null : v;
}

/** Plain decimal string without float noise (15 -> "15", 7.5 -> "7.5"). */
function decimalString(value: number): string {
  return String(Number(value.toFixed(3)));
}

export function newBillFormValues(today: string): BillFormValues {
  return {
    supplier_id: "",
    vehicle_id: NONE_OPTION,
    bill_date: today,
    invoice_ref: "",
    vat_mode: "exclusive",
    vat_rate: DEFAULT_VAT_RATE,
    odometer_km: "",
    notes: "",
    lines: [emptyBillLine()],
  };
}

/** Form values for editing a saved bill. Keeps the stored VAT rate (0%
 *  stays 0%) and leaves the odometer blank if none was typed. */
export function billToFormValues(bill: BillDetail): BillFormValues {
  return {
    supplier_id: bill.supplier_id,
    vehicle_id: bill.vehicle_id ?? NONE_OPTION,
    bill_date: bill.bill_date,
    invoice_ref: bill.invoice_ref,
    vat_mode: bill.vat_mode,
    vat_rate: decimalString(bill.vat_rate),
    odometer_km: bill.odometer_km == null ? "" : String(bill.odometer_km),
    notes: bill.notes ?? "",
    lines: [...bill.lines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        category_id: line.category_id ?? NONE_OPTION,
        description: line.description,
        quantity: decimalString(line.quantity),
        unit_amount: line.unit_amount.toFixed(2),
        vat_applicable: line.vat_applicable,
      })),
  };
}

/**
 * Validated form values -> RPC payload. vat_rate is always sent as a number,
 * never omitted or blank, so the RPC's default of 15 can't overwrite a
 * stored rate. A blank odometer is sent as null.
 */
export function formValuesToPayload(values: BillFormValues): WorkshopBillPayload {
  const notes = values.notes.trim();
  const odometer = values.odometer_km.trim();
  return {
    supplier_id: values.supplier_id.trim(),
    vehicle_id: idOrNull(values.vehicle_id),
    bill_date: values.bill_date.trim(),
    invoice_ref: values.invoice_ref.trim(),
    vat_mode: values.vat_mode,
    vat_rate: Number(values.vat_rate.trim()),
    odometer_km: odometer === "" ? null : Number(odometer),
    notes: notes === "" ? null : notes,
    lines: values.lines.map((line, index) => ({
      category_id: idOrNull(line.category_id),
      description: line.description.trim(),
      quantity: Number(line.quantity.trim()),
      unit_amount: Number(line.unit_amount.trim()),
      vat_applicable: line.vat_applicable,
      sort_order: index + 1,
    })),
  };
}
