import type { CustomRangeDraftValidation } from "@/lib/date-range/custom-range-draft";

export function customRangeApplyDisabledTitle(
  validation: CustomRangeDraftValidation,
  fromText: string,
  toText: string
): string | undefined {
  if (validation.canApply) return undefined;
  if (!fromText.trim() || !toText.trim()) {
    return "Enter From and To dates before applying.";
  }
  if (validation.fromInvalid || validation.toInvalid) {
    return "Enter valid dates in DD/MM/YYYY format.";
  }
  if (validation.orderError) {
    return validation.orderError;
  }
  return "Fix the date range before applying.";
}
