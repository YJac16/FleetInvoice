import "server-only";

import { formatVehicleLabel } from "@/features/vehicles/lib/vehicle-label";
import { createClient } from "@/lib/supabase/server";
import type {
  BillDetail,
  BillFormOptions,
  BillLine,
  BillListRow,
  BillStatus,
  SupplierRow,
  VatMode,
} from "@/features/maintenance/types";

/**
 * Reads for the maintenance pages. They use the signed-in user's client, so
 * the 00073 SELECT policies (platform owner, organisation_admin, manager of
 * the org) still apply, and they filter on the org explicitly as well.
 * Callers must have passed getMaintenancePageContext first.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Embedded<T> = T | T[] | null;
function one<T>(value: Embedded<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type VehicleEmbed = { id: string; name: string | null; registration_number: string | null };

function vehicleLabel(v: VehicleEmbed | null): string | null {
  return v ? formatVehicleLabel(v) : null;
}

const num = (v: unknown): number => Number(v ?? 0);

export async function listBills(organisationId: string): Promise<BillListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_bills")
    .select(
      "id, bill_date, invoice_ref, status, total_incl, attachment_path, supplier:suppliers(name), vehicle:vehicles(id, name, registration_number)"
    )
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      bill_date: string;
      invoice_ref: string;
      status: BillStatus;
      total_incl: unknown;
      attachment_path: string | null;
      supplier: Embedded<{ name: string }>;
      vehicle: Embedded<VehicleEmbed>;
    };
    return {
      id: r.id,
      bill_date: r.bill_date,
      invoice_ref: r.invoice_ref,
      status: r.status,
      total_incl: num(r.total_incl),
      supplier_name: one(r.supplier)?.name ?? "—",
      vehicle_label: vehicleLabel(one(r.vehicle)),
      has_attachment: Boolean(r.attachment_path),
    };
  });
}

export async function getBill(organisationId: string, billId: string): Promise<BillDetail | null> {
  if (!UUID_RE.test(billId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_bills")
    .select(
      "id, supplier_id, vehicle_id, bill_date, invoice_ref, vat_mode, vat_rate, subtotal_excl, vat_amount, total_incl, status, odometer_km, notes, attachment_path, attachment_mime, attachment_size, supplier:suppliers(name), vehicle:vehicles(id, name, registration_number)"
    )
    .eq("id", billId)
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: lineRows, error: lineError } = await supabase
    .from("workshop_bill_lines")
    .select(
      "id, category_id, description, quantity, unit_amount, vat_applicable, line_excl, line_vat, line_incl, sort_order, category:maintenance_categories(name)"
    )
    .eq("bill_id", billId)
    .eq("organisation_id", organisationId)
    .order("sort_order", { ascending: true });
  if (lineError) throw new Error(lineError.message);

  const b = data as unknown as {
    id: string;
    supplier_id: string;
    vehicle_id: string | null;
    bill_date: string;
    invoice_ref: string;
    vat_mode: VatMode;
    vat_rate: unknown;
    subtotal_excl: unknown;
    vat_amount: unknown;
    total_incl: unknown;
    status: BillStatus;
    odometer_km: number | null;
    notes: string | null;
    attachment_path: string | null;
    attachment_mime: string | null;
    attachment_size: number | null;
    supplier: Embedded<{ name: string }>;
    vehicle: Embedded<VehicleEmbed>;
  };

  const lines: BillLine[] = (lineRows ?? []).map((row) => {
    const l = row as unknown as Omit<BillLine, "category_name" | "quantity" | "unit_amount" | "line_excl" | "line_vat" | "line_incl"> & {
      quantity: unknown;
      unit_amount: unknown;
      line_excl: unknown;
      line_vat: unknown;
      line_incl: unknown;
      category: Embedded<{ name: string }>;
    };
    return {
      id: l.id,
      category_id: l.category_id,
      category_name: one(l.category)?.name ?? null,
      description: l.description,
      quantity: num(l.quantity),
      unit_amount: num(l.unit_amount),
      vat_applicable: l.vat_applicable,
      line_excl: num(l.line_excl),
      line_vat: num(l.line_vat),
      line_incl: num(l.line_incl),
      sort_order: l.sort_order,
    };
  });

  return {
    id: b.id,
    supplier_id: b.supplier_id,
    supplier_name: one(b.supplier)?.name ?? "—",
    vehicle_id: b.vehicle_id,
    vehicle_label: vehicleLabel(one(b.vehicle)),
    bill_date: b.bill_date,
    invoice_ref: b.invoice_ref,
    vat_mode: b.vat_mode,
    vat_rate: num(b.vat_rate),
    subtotal_excl: num(b.subtotal_excl),
    vat_amount: num(b.vat_amount),
    total_incl: num(b.total_incl),
    status: b.status,
    odometer_km: b.odometer_km == null ? null : Number(b.odometer_km),
    notes: b.notes,
    has_attachment: Boolean(b.attachment_path),
    attachment_mime: b.attachment_mime,
    attachment_size: b.attachment_size,
    lines,
  };
}

export async function listSuppliers(organisationId: string): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, vat_number, contact_phone, email, notes, active")
    .eq("organisation_id", organisationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierRow[];
}

/**
 * Dropdown options for the bill form. Only active suppliers and categories
 * are offered, but the ones a bill already uses are kept so editing it
 * doesn't silently drop them.
 */
export async function getBillFormOptions(
  organisationId: string,
  keep: { supplierId?: string | null; categoryIds?: Array<string | null> } = {}
): Promise<BillFormOptions> {
  const supabase = await createClient();
  const [suppliers, categories, vehicles] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, active")
      .eq("organisation_id", organisationId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("maintenance_categories")
      .select("id, name, active")
      .eq("organisation_id", organisationId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("vehicles")
      .select("id, name, registration_number")
      .eq("organisation_id", organisationId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);
  if (suppliers.error) throw new Error(suppliers.error.message);
  if (categories.error) throw new Error(categories.error.message);
  if (vehicles.error) throw new Error(vehicles.error.message);

  const keepCategories = new Set((keep.categoryIds ?? []).filter(Boolean));
  type Named = { id: string; name: string; active: boolean };

  return {
    suppliers: ((suppliers.data ?? []) as Named[])
      .filter((s) => s.active || s.id === keep.supplierId)
      .map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} (inactive)` })),
    categories: ((categories.data ?? []) as Named[])
      .filter((c) => c.active || keepCategories.has(c.id))
      .map((c) => ({ value: c.id, label: c.active ? c.name : `${c.name} (inactive)` })),
    vehicles: ((vehicles.data ?? []) as VehicleEmbed[]).map((v) => ({
      value: v.id,
      label: formatVehicleLabel(v),
    })),
  };
}
