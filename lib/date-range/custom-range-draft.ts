import { parseDisplayDateToIso } from "@/lib/date-range/calendar-text";

export const CUSTOM_RANGE_ORDER_ERROR =
  "End date must be on or after start date.";

export type CustomRangeDraftValidation = {
  fromIso: string | null;
  toIso: string | null;
  canApply: boolean;
  fromInvalid: boolean;
  toInvalid: boolean;
  orderError: string | null;
};

export function validateCustomRangeDraft(
  fromText: string,
  toText: string
): CustomRangeDraftValidation {
  const fromTrimmed = fromText.trim();
  const toTrimmed = toText.trim();
  const fromIso = parseDisplayDateToIso(fromText);
  const toIso = parseDisplayDateToIso(toText);

  const fromInvalid = fromTrimmed.length > 0 && !fromIso;
  const toInvalid = toTrimmed.length > 0 && !toIso;
  const bothValid = Boolean(fromIso && toIso);
  const orderInvalid = bothValid && fromIso! > toIso!;

  return {
    fromIso,
    toIso,
    canApply: bothValid && !orderInvalid,
    fromInvalid,
    toInvalid,
    orderError: orderInvalid ? CUSTOM_RANGE_ORDER_ERROR : null,
  };
}
