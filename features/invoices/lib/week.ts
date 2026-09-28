import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Weekly driver invoice periods use calendar dates in Africa/Johannesburg (Mon–Sun inclusive). */
export const INVOICE_TZ = "Africa/Johannesburg";

/** Monday (SAST) for the week containing `date`. */
export function mondayOfWeek(date = new Date()): string {
  const d = dayjs(date).tz(INVOICE_TZ);
  const day = d.day();
  const diff = day === 0 ? -6 : 1 - day;
  return d.add(diff, "day").format("YYYY-MM-DD");
}

/** Inclusive Sunday (period_start + 6 days), stored on invoices.period_end. */
export function weekPeriodEnd(weekStart: string): string {
  const start = dayjs.tz(weekStart, INVOICE_TZ);
  if (!start.isValid()) {
    throw new Error("Invalid week_start date");
  }
  return start.add(6, "day").format("YYYY-MM-DD");
}

/**
 * Exclusive upper bound for timestamptz range checks: Monday 00:00 SAST after the service week.
 * Accepts stored period_end as inclusive Sunday or legacy exclusive Monday.
 */
export function weekPeriodUpperBoundExclusive(
  weekStart: string,
  periodEnd: string
): dayjs.Dayjs {
  const start = dayjs.tz(weekStart, INVOICE_TZ);
  const end = dayjs.tz(periodEnd, INVOICE_TZ);
  const spanDays = end.diff(start, "day");
  if (spanDays === 6) {
    return end.add(1, "day").startOf("day");
  }
  if (spanDays === 7) {
    return end.startOf("day");
  }
  throw new Error("Invalid invoice week bounds");
}

/** True if filledAt (ISO timestamptz) falls in the SAST service week [Mon 00:00, next Mon 00:00). */
export function isFilledAtInWeek(
  filledAt: string,
  weekStart: string,
  periodEnd = weekPeriodEnd(weekStart)
): boolean {
  const t = dayjs(filledAt);
  if (!t.isValid()) return false;
  const start = dayjs.tz(weekStart, INVOICE_TZ).startOf("day");
  const end = weekPeriodUpperBoundExclusive(weekStart, periodEnd);
  return !t.isBefore(start) && t.isBefore(end);
}
