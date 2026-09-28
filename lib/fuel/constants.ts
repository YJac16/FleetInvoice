export const FUEL_SLIPS_BUCKET = "fuel-slips";

/** Server rejects uploads above this (Vercel Hobby body limit). */
export const FUEL_SLIP_MAX_BYTES = 4 * 1024 * 1024;

export const FUEL_SLIP_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type FuelSlipAllowedMime = (typeof FUEL_SLIP_ALLOWED_MIMES)[number];

export const FUEL_SLIP_VIEW_URL_SECONDS = 60;

export const FUEL_SLIP_PHOTO_MAX_EDGE = 2400;

export const FUEL_TYPES = [
  "ulp93",
  "ulp95",
  "diesel50",
  "diesel500",
  "other",
] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export const FUEL_REVIEW_STATUSES = [
  "pending_review",
  "queried",
  "approved",
  "rejected",
  "voided",
] as const;
