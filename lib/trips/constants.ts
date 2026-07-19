import type { TripStatus } from "@/types/database";

/** Fallback Cape Town areas when the areas table is empty. */
export const DEFAULT_AREA_NAMES = [
  "Town",
  "Woodstock",
  "Green Point",
  "Sea Point",
  "Airport",
  "Bellville",
  "Parow",
  "Milnerton",
  "Observatory",
  "Other",
] as const;

export const TRIP_STATUSES: TripStatus[] = [
  "pending",
  "approved",
  "rejected",
  "invoiced",
];

export const TRIP_DRAFT_STORAGE_KEY = "fleetinvoice_trip_draft_v1";

export const TRIP_AUTOSAVE_MS = 15_000;

export type TripFilterPreset =
  | "all"
  | "today"
  | "this_week"
  | "this_month"
  | "pending"
  | "approved"
  | "rejected";

export const TRIP_FILTER_PRESETS: {
  value: TripFilterPreset;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export function canDriverEditTrip(status: TripStatus): boolean {
  return status === "pending" || status === "rejected";
}

export function canDriverDeleteTrip(status: TripStatus): boolean {
  return status === "pending";
}
