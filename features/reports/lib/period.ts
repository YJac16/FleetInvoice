/**
 * Period helpers for reports: [periodStart, periodEnd) in UTC YYYY-MM-DD.
 */

export function isInstantInPeriod(
  isoInstant: string,
  periodStart: string,
  periodEnd: string
): boolean {
  const t = new Date(isoInstant).getTime();
  const start = new Date(`${periodStart}T00:00:00.000Z`).getTime();
  const end = new Date(`${periodEnd}T00:00:00.000Z`).getTime();
  if (Number.isNaN(t) || Number.isNaN(start) || Number.isNaN(end)) return false;
  return t >= start && t < end;
}

export function isDateInPeriod(
  dateOnly: string,
  periodStart: string,
  periodEnd: string
): boolean {
  return dateOnly >= periodStart && dateOnly < periodEnd;
}
