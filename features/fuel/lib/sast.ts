import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const FUEL_TZ = "Africa/Johannesburg";

/** Build timestamptz from local date + time strings in SAST (server-side). */
export function filledAtFromSastParts(
  dateYmd: string,
  timeHm: string
): string {
  const combined = `${dateYmd}T${timeHm}:00`;
  return dayjs.tz(combined, FUEL_TZ).toISOString();
}

export function formatFilledAtSast(iso: string): string {
  return dayjs(iso).tz(FUEL_TZ).format("dddd D MMMM YYYY, HH:mm");
}

export function formatCsvDateSast(iso: string): string {
  return dayjs(iso).tz(FUEL_TZ).format("YYYY-MM-DD HH:mm");
}

/** Accept decimal comma from mobile keyboards. */
export function parseDecimalInput(raw: string): number | null {
  const normalised = raw.trim().replace(",", ".");
  if (!normalised) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}
