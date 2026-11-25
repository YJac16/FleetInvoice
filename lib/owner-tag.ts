/**
 * Owner dimension (migration 00088): drivers, vehicles and invoices carry
 * owner_tag 'yaseen' | 'fadia' | null (null = unassigned). Driver-week
 * invoices take the driver's owner; invoices without a driver use their own
 * owner_tag.
 */
export const OWNER_TAGS = ["yaseen", "fadia"] as const;
export type OwnerTag = (typeof OWNER_TAGS)[number];

/** "unassigned" is the bucket for rows with no owner. */
export type OwnerBucket = OwnerTag | "unassigned";

/** Owner filter used by invoices and reports. */
export const OWNER_FILTERS = ["all", ...OWNER_TAGS] as const;
export type OwnerFilter = (typeof OWNER_FILTERS)[number];

export const OWNER_LABELS: Record<OwnerBucket, string> = {
  yaseen: "Yaseen",
  fadia: "Fadia",
  unassigned: "Unassigned",
};

export const OWNER_FILTER_LABELS: Record<OwnerFilter, string> = {
  all: "All",
  yaseen: "Yaseen",
  fadia: "Fadia",
};

export function isOwnerTag(value: unknown): value is OwnerTag {
  return typeof value === "string" && (OWNER_TAGS as readonly string[]).includes(value);
}

/** Normalises free text (CSV imports, form values) to an owner tag or null. */
export function parseOwnerTag(value: unknown): OwnerTag | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "" || v === "unassigned" || v === "none") return null;
  return isOwnerTag(v) ? v : null;
}

export function ownerBucket(tag: OwnerTag | null | undefined): OwnerBucket {
  return isOwnerTag(tag) ? tag : "unassigned";
}

export function ownerLabel(tag: OwnerTag | null | undefined): string {
  return OWNER_LABELS[ownerBucket(tag)];
}

/** invoice.drivers.owner_tag ?? invoice.owner_tag ?? null */
export function resolveInvoiceOwner(invoice: {
  owner_tag?: OwnerTag | null;
  drivers?: { owner_tag?: OwnerTag | null } | null;
}): OwnerTag | null {
  const fromDriver = invoice.drivers?.owner_tag;
  if (isOwnerTag(fromDriver)) return fromDriver;
  return isOwnerTag(invoice.owner_tag) ? invoice.owner_tag : null;
}

export function matchesOwnerFilter(
  tag: OwnerTag | null | undefined,
  filter: OwnerFilter
): boolean {
  if (filter === "all") return true;
  return tag === filter;
}
