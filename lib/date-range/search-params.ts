import {
  type DateRangePreset,
  resolveDateRange,
  type ResolvedDateRange,
} from "@/lib/date-range/sast-range";

export const RANGE_PARAM = "range";
export const FROM_PARAM = "from";
export const TO_PARAM = "to";

const PRESETS: DateRangePreset[] = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "custom",
];

function parsePreset(value: string | null | undefined): DateRangePreset | null {
  if (!value) return null;
  return PRESETS.includes(value as DateRangePreset)
    ? (value as DateRangePreset)
    : null;
}

export function dateRangeFromSearchParams(
  params: URLSearchParams,
  defaultPreset: DateRangePreset = "this_week"
): ResolvedDateRange {
  const preset = parsePreset(params.get(RANGE_PARAM)) ?? defaultPreset;
  const from = params.get(FROM_PARAM);
  const to = params.get(TO_PARAM);
  return resolveDateRange(preset, from, to);
}

export function applyDateRangeToSearchParams(
  base: URLSearchParams,
  range: ResolvedDateRange
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  next.set(RANGE_PARAM, range.preset);
  if (range.preset === "custom") {
    next.set(FROM_PARAM, range.from);
    next.set(TO_PARAM, range.to);
  } else {
    next.delete(FROM_PARAM);
    next.delete(TO_PARAM);
  }
  return next;
}
