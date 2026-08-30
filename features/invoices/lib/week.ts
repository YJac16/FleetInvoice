/**
 * Driver weekly invoice period helpers (Africa/Johannesburg calendar dates).
 * RPC window: [period_start, period_end) in SAST — Mon 00:00 through Sun 23:59.
 */

export const INVOICE_TIMEZONE = "Africa/Johannesburg";

const sastDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: INVOICE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date YYYY-MM-DD in SAST for `date`. */
export function ymdInSast(date = new Date()): string {
  return sastDateFormatter.format(date);
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${ymd}`);
  return { y, m, d };
}

/** Add calendar days to a YYYY-MM-DD string (SAST calendar arithmetic). */
export function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Day of week 0=Sun … 6=Sat for a SAST calendar date. */
export function weekdayInSast(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  // Noon SAST = 10:00 UTC (SAST is fixed UTC+2).
  return new Date(Date.UTC(y, m - 1, d, 10, 0, 0)).getUTCDay();
}

/** Monday (SAST) of the week containing `ymd`. */
export function mondayOfWeekYmd(ymd: string): string {
  const dow = weekdayInSast(ymd);
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(ymd, diff);
}

/** Exclusive end date (Monday after service week). */
export function weekPeriodEnd(weekStart: string): string {
  return addDaysYmd(weekStart, 7);
}

/** Sunday (last day) of the service week. */
export function serviceWeekSunday(weekStart: string): string {
  return addDaysYmd(weekStart, 6);
}

/** Invoice date = Monday after service week (= exclusive period_end). */
export function invoiceDateFromWeekStart(weekStart: string): string {
  return weekPeriodEnd(weekStart);
}

/**
 * Default service week Monday (SAST):
 * - If today is Monday → previous Mon–Sun (invoice date = today).
 * - Otherwise → current Mon–Sun (invoice date = upcoming Monday).
 */
export function defaultServiceWeekMonday(now = new Date()): string {
  const today = ymdInSast(now);
  const currentWeekMonday = mondayOfWeekYmd(today);
  if (weekdayInSast(today) === 1) {
    return addDaysYmd(currentWeekMonday, -7);
  }
  return currentWeekMonday;
}

/** Recent service-week Mondays for dropdown (newest first). */
export function recentServiceWeekMondays(
  count = 8,
  now = new Date()
): string[] {
  const start = defaultServiceWeekMonday(now);
  return Array.from({ length: count }, (_, i) => addDaysYmd(start, -7 * i));
}

/** @deprecated Use SAST helpers above. Kept for legacy fuel/UTC callers. */
export function mondayOfWeek(date = new Date()): string {
  return mondayOfWeekYmd(ymdInSast(date));
}

/** True if filledAt (ISO timestamptz) falls in [weekStart, weekEnd) SAST bounds. */
export function isFilledAtInWeek(
  filledAt: string,
  weekStart: string,
  weekEnd = weekPeriodEnd(weekStart)
): boolean {
  const t = new Date(filledAt).getTime();
  const start = sastStartInstant(weekStart).getTime();
  const end = sastStartInstant(weekEnd).getTime();
  if (Number.isNaN(t) || Number.isNaN(start) || Number.isNaN(end)) return false;
  return t >= start && t < end;
}

/** SAST midnight as Date for RPC-aligned comparisons in tests. */
export function sastStartInstant(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+02:00`);
}
