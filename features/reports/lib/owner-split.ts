import {
  isOwnerTag,
  matchesOwnerFilter,
  OWNER_TAGS,
  type OwnerBucket,
  type OwnerFilter,
  type OwnerTag,
} from "@/lib/owner-tag";

/** One owner's subtotal in a report. Fields that don't apply stay 0. */
export type OwnerSplitRow = {
  owner: OwnerBucket;
  count: number;
  litres: number;
  amount: number;
  issued: number;
  paid: number;
};

export type OwnerLookup = {
  drivers: ReadonlyMap<string, OwnerTag | null>;
  vehicles: ReadonlyMap<string, OwnerTag | null>;
  /** Driver display names (optional; reports fall back to blank). */
  driverNames?: ReadonlyMap<string, string>;
};

export const EMPTY_OWNER_LOOKUP: OwnerLookup = { drivers: new Map(), vehicles: new Map() };

/** Trip / fuel owner: the driver's owner, else the vehicle's owner, else unassigned. */
export function resolveFleetOwner(
  lookup: OwnerLookup,
  driverId: string | null | undefined,
  vehicleId: string | null | undefined
): OwnerTag | null {
  const fromDriver = driverId ? lookup.drivers.get(driverId) : null;
  if (isOwnerTag(fromDriver)) return fromDriver;
  const fromVehicle = vehicleId ? lookup.vehicles.get(vehicleId) : null;
  return isOwnerTag(fromVehicle) ? fromVehicle : null;
}

export function toBucket(tag: OwnerTag | null | undefined): OwnerBucket {
  return isOwnerTag(tag) ? tag : "unassigned";
}

export function filterRowsByOwner<T extends { owner: OwnerBucket }>(rows: T[], filter: OwnerFilter): T[] {
  if (filter === "all") return rows;
  return rows.filter((row) => matchesOwnerFilter(row.owner === "unassigned" ? null : row.owner, filter));
}

function emptyRow(owner: OwnerBucket): OwnerSplitRow {
  return { owner, count: 0, litres: 0, amount: 0, issued: 0, paid: 0 };
}

/**
 * Subtotals per owner: Yaseen and Fadia always, Unassigned only when it has
 * rows. Sum of the returned rows always equals combinedTotals(rows).
 */
export function splitByOwner(
  rows: ReadonlyArray<{
    owner: OwnerBucket;
    litres?: number | null;
    amount?: number | null;
    issued?: number | null;
    paid?: number | null;
  }>
): OwnerSplitRow[] {
  const out = new Map<OwnerBucket, OwnerSplitRow>();
  for (const tag of OWNER_TAGS) out.set(tag, emptyRow(tag));
  for (const row of rows) {
    const bucket = out.get(row.owner) ?? emptyRow(row.owner);
    bucket.count += 1;
    bucket.litres += Number(row.litres) || 0;
    bucket.amount += Number(row.amount) || 0;
    bucket.issued += Number(row.issued) || 0;
    bucket.paid += Number(row.paid) || 0;
    out.set(row.owner, bucket);
  }
  const result = [...OWNER_TAGS.map((t) => out.get(t)!)];
  const unassigned = out.get("unassigned");
  if (unassigned && unassigned.count > 0) result.push(unassigned);
  return result.map((r) => ({
    ...r,
    litres: round2(r.litres),
    amount: round2(r.amount),
    issued: round2(r.issued),
    paid: round2(r.paid),
  }));
}

export function combinedTotals(split: ReadonlyArray<OwnerSplitRow>): Omit<OwnerSplitRow, "owner"> {
  const total = { count: 0, litres: 0, amount: 0, issued: 0, paid: 0 };
  for (const r of split) {
    total.count += r.count;
    total.litres += r.litres;
    total.amount += r.amount;
    total.issued += r.issued;
    total.paid += r.paid;
  }
  return {
    count: total.count,
    litres: round2(total.litres),
    amount: round2(total.amount),
    issued: round2(total.issued),
    paid: round2(total.paid),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
