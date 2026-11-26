/**
 * Maintenance due forecast. Every figure here is an estimate and the UI
 * labels it so. No thresholds are invented: a km/day rate is only used when
 * the readings are 2+, 30+ days apart and 1,000+ km apart.
 */

export const MIN_RATE_READINGS = 2;
export const MIN_RATE_DAYS = 30;
export const MIN_RATE_KM = 1000;

export type Reading = { date: string; km: number }; // date: YYYY-MM-DD

export type RateResult = { ok: true; kmPerDay: number } | { ok: false };

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

function isoFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Add calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month, Math.min(d, last)));
  return date.toISOString().slice(0, 10);
}

/** km/day from the earliest and latest reading, only when the gates pass. */
export function kmPerDay(readings: readonly Reading[]): RateResult {
  if (readings.length < MIN_RATE_READINGS) return { ok: false };
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = dayNumber(last.date) - dayNumber(first.date);
  const km = last.km - first.km;
  if (days < MIN_RATE_DAYS || km < MIN_RATE_KM) return { ok: false };
  return { ok: true, kmPerDay: km / days };
}

export type DueInput = {
  today: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  /** Last Final bill carrying this category for this vehicle. */
  lastBillDate: string;
  lastOdometerKm: number | null;
  /** Latest known odometer reading for the vehicle (bills + fill-ups). */
  currentKm: number | null;
  readings: readonly Reading[];
};

export type DueEstimate = {
  dueKm: number | null;
  dueDate: string | null;
  /** Where the date came from. */
  dateBasis: "months" | "km" | null;
  /** True when current odometer is past dueKm or the date has passed. */
  overdue: boolean;
  /** No km, no date: nothing could be worked out. */
  hasEstimate: boolean;
};

export function computeDue(input: DueInput): DueEstimate {
  const dueKm =
    input.intervalKm != null && input.lastOdometerKm != null
      ? input.lastOdometerKm + input.intervalKm
      : null;

  const monthsDate =
    input.intervalMonths != null ? addMonths(input.lastBillDate, input.intervalMonths) : null;

  let kmDate: string | null = null;
  if (dueKm != null && input.currentKm != null) {
    const rate = kmPerDay(input.readings);
    if (rate.ok) {
      const remaining = dueKm - input.currentKm;
      const latest = [...input.readings].sort((a, b) => b.date.localeCompare(a.date))[0];
      const from = latest ? latest.date : input.today;
      kmDate = isoFromDay(dayNumber(from) + Math.max(0, Math.ceil(remaining / rate.kmPerDay)));
    }
  }

  let dueDate: string | null = null;
  let dateBasis: DueEstimate["dateBasis"] = null;
  if (monthsDate && (!kmDate || monthsDate <= kmDate)) {
    dueDate = monthsDate;
    dateBasis = "months";
  } else if (kmDate) {
    dueDate = kmDate;
    dateBasis = "km";
  }

  const overdue =
    (dueDate != null && dueDate < input.today) ||
    (dueKm != null && input.currentKm != null && input.currentKm >= dueKm);

  return { dueKm, dueDate, dateBasis, overdue, hasEstimate: dueKm != null || dueDate != null };
}
