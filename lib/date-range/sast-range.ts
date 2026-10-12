import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { INVOICE_TZ, mondayOfWeek } from "@/features/invoices/lib/week";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Calendar dates and list filters use Africa/Johannesburg (SAST). */
export const LIST_FILTER_TZ = INVOICE_TZ;

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "custom";

export type ResolvedDateRange = {
  preset: DateRangePreset;
  /** Inclusive calendar date (YYYY-MM-DD) in SAST. */
  from: string;
  /** Inclusive calendar date (YYYY-MM-DD) in SAST. */
  to: string;
  /** Exclusive upper bound date for half-open API ranges [from, toExclusive). */
  toExclusive: string;
};

export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "custom", label: "Custom" },
];

export function todayInListTz(now = new Date()): string {
  return dayjs(now).tz(LIST_FILTER_TZ).format("YYYY-MM-DD");
}

function addCalendarDays(dateStr: string, days: number): string {
  return dayjs.tz(dateStr, LIST_FILTER_TZ).add(days, "day").format("YYYY-MM-DD");
}

function sundayOfWeekContaining(dateStr: string): string {
  const monday = mondayOfWeek(dayjs.tz(dateStr, LIST_FILTER_TZ).toDate());
  return addCalendarDays(monday, 6);
}

export function resolveDateRange(
  preset: DateRangePreset,
  customFrom?: string | null,
  customTo?: string | null,
  now = new Date()
): ResolvedDateRange {
  const today = todayInListTz(now);

  let from: string;
  let to: string;

  switch (preset) {
    case "today":
      from = today;
      to = today;
      break;
    case "yesterday": {
      const y = addCalendarDays(today, -1);
      from = y;
      to = y;
      break;
    }
    case "this_week": {
      const monday = mondayOfWeek(now);
      from = monday;
      to = sundayOfWeekContaining(monday);
      break;
    }
    case "last_week": {
      const thisMonday = mondayOfWeek(now);
      const lastMonday = addCalendarDays(thisMonday, -7);
      from = lastMonday;
      to = sundayOfWeekContaining(lastMonday);
      break;
    }
    case "custom": {
      const fallbackFrom = customFrom && isValidDateStr(customFrom) ? customFrom : today;
      const fallbackTo =
        customTo && isValidDateStr(customTo) ? customTo : fallbackFrom;
      from = fallbackFrom <= fallbackTo ? fallbackFrom : fallbackTo;
      to = fallbackFrom <= fallbackTo ? fallbackTo : fallbackFrom;
      break;
    }
    default:
      from = today;
      to = today;
  }

  const toExclusive = addCalendarDays(to, 1);
  return { preset, from, to, toExclusive };
}

function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs.tz(value, LIST_FILTER_TZ).isValid();
}

/** Half-open interval [from 00:00 SAST, toExclusive 00:00 SAST). */
export function rangeBoundsInstant(range: ResolvedDateRange): {
  startInclusive: dayjs.Dayjs;
  endExclusive: dayjs.Dayjs;
} {
  const startInclusive = dayjs.tz(range.from, LIST_FILTER_TZ).startOf("day");
  const endExclusive = dayjs.tz(range.toExclusive, LIST_FILTER_TZ).startOf("day");
  return { startInclusive, endExclusive };
}

export function isInstantInRange(iso: string, range: ResolvedDateRange): boolean {
  const t = dayjs(iso);
  if (!t.isValid()) return false;
  const { startInclusive, endExclusive } = rangeBoundsInstant(range);
  const z = t.tz(LIST_FILTER_TZ);
  return !z.isBefore(startInclusive) && z.isBefore(endExclusive);
}

const SA_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: LIST_FILTER_TZ,
};

function formatSaCalendarDate(dateStr: string): string {
  const d = dayjs.tz(dateStr, LIST_FILTER_TZ);
  return new Intl.DateTimeFormat("en-ZA", SA_DATE_FORMAT).format(d.toDate());
}

export function formatRangeLabel(range: ResolvedDateRange): string {
  if (range.from === range.to) {
    return formatSaCalendarDate(range.from);
  }
  return `${formatSaCalendarDate(range.from)} – ${formatSaCalendarDate(range.to)}`;
}
