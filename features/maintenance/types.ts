export type MaintenanceOption = { value: string; label: string };

export type SupplierRow = {
  id: string;
  name: string;
  vat_number: string | null;
  contact_phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
};

export type BillStatus = "draft" | "approved";
export type VatMode = "exclusive" | "inclusive";

export type BillListRow = {
  id: string;
  bill_date: string;
  invoice_ref: string;
  status: BillStatus;
  total_incl: number;
  supplier_name: string;
  vehicle_label: string | null;
  has_attachment: boolean;
};

export type BillLine = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  description: string;
  quantity: number;
  unit_amount: number;
  vat_applicable: boolean;
  line_excl: number;
  line_vat: number;
  line_incl: number;
  sort_order: number;
};

/** A bill as the pages see it. The storage path never leaves the server. */
export type BillDetail = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  vehicle_id: string | null;
  vehicle_label: string | null;
  bill_date: string;
  invoice_ref: string;
  vat_mode: VatMode;
  vat_rate: number;
  subtotal_excl: number;
  vat_amount: number;
  total_incl: number;
  status: BillStatus;
  odometer_km: number | null;
  notes: string | null;
  has_attachment: boolean;
  attachment_mime: string | null;
  attachment_size: number | null;
  lines: BillLine[];
};

export type BillFormOptions = {
  /** Last Final-bill price per category (same vehicle first, else org). */
  lastPaid?: import("@/features/maintenance/lib/last-paid").LastPaidIndex;
  suppliers: MaintenanceOption[];
  categories: MaintenanceOption[];
  vehicles: MaintenanceOption[];
};

export type BillExportOptions = {
  suppliers: MaintenanceOption[];
  vehicles: MaintenanceOption[];
};

export type MaintenanceActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      message: string;
      fieldErrors?: Record<string, string>;
    };
