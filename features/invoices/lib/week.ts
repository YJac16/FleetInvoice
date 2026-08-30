/**
 * Weekly invoice period helpers (UTC date strings YYYY-MM-DD).
 * RPC window is [week_start, week_start+7).
 */

/** Monday (UTC) for the week containing `date`. */
export function mondayOfWeek(date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Exclusive end date (week_start + 7 days), matching generate_weekly_fuel_invoice. */
export function weekPeriodEnd(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid week_start date");
  }
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** True if filledAt (ISO timestamptz) falls in [weekStart, weekEnd). */
export function isFilledAtInWeek(
  filledAt: string,
  weekStart: string,
  weekEnd = weekPeriodEnd(weekStart)
): boolean {
  const t = new Date(filledAt).getTime();
  const start = new Date(`${weekStart}T00:00:00.000Z`).getTime();
  const end = new Date(`${weekEnd}T00:00:00.000Z`).getTime();
  if (Number.isNaN(t) || Number.isNaN(start) || Number.isNaN(end)) return false;
  return t >= start && t < end;
}
