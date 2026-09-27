import { complianceTodaySast } from "@/features/compliance/lib/compliance-dates";

export type ComplianceExpiryStatus =
  | "expired"
  | "due_7"
  | "due_30"
  | "due_60"
  | "ok"
  | "not_captured";

export const LICENSE_CODES = [
  "A1",
  "A",
  "B",
  "EB",
  "C1",
  "C",
  "EC1",
  "EC",
  "Other",
] as const;

export type LicenseCode = (typeof LICENSE_CODES)[number];

export function complianceStatusForDate(
  expiresOn: string | null | undefined,
  today = complianceTodaySast()
): ComplianceExpiryStatus {
  if (!expiresOn?.trim()) return "not_captured";
  const day = expiresOn.slice(0, 10);
  const days = daysBetween(today, day);
  return complianceStatusForDaysRemaining(days);
}

export function complianceStatusForDaysRemaining(
  daysRemaining: number
): ComplianceExpiryStatus {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= 7) return "due_7";
  if (daysRemaining <= 30) return "due_30";
  if (daysRemaining <= 60) return "due_60";
  return "ok";
}

export function complianceStatusLabel(status: ComplianceExpiryStatus): string {
  switch (status) {
    case "expired":
      return "Expired";
    case "due_7":
      return "≤7 days";
    case "due_30":
      return "≤30 days";
    case "due_60":
      return "≤60 days";
    case "ok":
      return "OK";
    case "not_captured":
      return "Not captured";
  }
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseUtcDate(fromIso);
  const to = parseUtcDate(toIso);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function parseUtcDate(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
