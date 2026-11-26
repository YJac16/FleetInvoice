import { formatZarAmount } from "@/features/invoices/lib/invoice-print-format";

/**
 * "Last paid" per category, from Final (approved) workshop bills only.
 * Same vehicle first, else anywhere in the organisation, else nothing.
 * Pure: the query layer feeds it rows, the bill form reads the index.
 */

export type PaidLine = {
  category_id: string | null;
  vehicle_id: string | null;
  bill_date: string; // YYYY-MM-DD
  supplier_name: string;
  quantity: number;
  line_excl: number;
  line_incl: number;
};

export type LastPaid = {
  date: string;
  supplier: string;
  /** Per-unit amounts so the form can prefill either VAT mode. */
  unit_excl: number;
  unit_incl: number;
};

export type LastPaidIndex = Record<
  string,
  { org: LastPaid | null; byVehicle: Record<string, LastPaid> }
>;

function toLastPaid(line: PaidLine): LastPaid {
  const qty = line.quantity > 0 ? line.quantity : 1;
  return {
    date: line.bill_date,
    supplier: line.supplier_name,
    unit_excl: round2(line.line_excl / qty),
    unit_incl: round2(line.line_incl / qty),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Newest first; the date is ISO so string comparison is date order. */
function isNewer(a: PaidLine, b: PaidLine | undefined): boolean {
  return !b || a.bill_date > b.bill_date;
}

export function buildLastPaidIndex(lines: readonly PaidLine[]): LastPaidIndex {
  const orgBest = new Map<string, PaidLine>();
  const vehicleBest = new Map<string, PaidLine>(); // key: category|vehicle
  for (const line of lines) {
    if (!line.category_id) continue;
    if (isNewer(line, orgBest.get(line.category_id))) orgBest.set(line.category_id, line);
    if (line.vehicle_id) {
      const key = `${line.category_id}|${line.vehicle_id}`;
      if (isNewer(line, vehicleBest.get(key))) vehicleBest.set(key, line);
    }
  }
  const index: LastPaidIndex = {};
  for (const [categoryId, line] of orgBest) {
    index[categoryId] = { org: toLastPaid(line), byVehicle: {} };
  }
  for (const [key, line] of vehicleBest) {
    const [categoryId, vehicleId] = key.split("|");
    index[categoryId].byVehicle[vehicleId] = toLastPaid(line);
  }
  return index;
}

export type ResolvedLastPaid = (LastPaid & { scope: "vehicle" | "org" }) | null;

export function resolveLastPaid(
  index: LastPaidIndex,
  categoryId: string | null,
  vehicleId: string | null
): ResolvedLastPaid {
  if (!categoryId) return null;
  const entry = index[categoryId];
  if (!entry) return null;
  const own = vehicleId ? entry.byVehicle[vehicleId] : undefined;
  if (own) return { ...own, scope: "vehicle" };
  return entry.org ? { ...entry.org, scope: "org" } : null;
}

export function lastPaidUnit(paid: LastPaid, mode: "exclusive" | "inclusive"): number {
  return mode === "inclusive" ? paid.unit_incl : paid.unit_excl;
}

/** "Last paid R1 200.00 on 2026-03-02, Acme Tyres" or "No past bill". */
export function lastPaidText(
  paid: ResolvedLastPaid,
  mode: "exclusive" | "inclusive"
): string {
  if (!paid) return "No past bill";
  const amount = formatZarAmount(lastPaidUnit(paid, mode));
  const suffix = mode === "inclusive" ? "incl. VAT" : "excl. VAT";
  return `Last paid ${amount} (${suffix}) on ${paid.date}, ${paid.supplier}`;
}
