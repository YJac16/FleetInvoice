import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { LIST_FILTER_TZ } from "@/lib/date-range/sast-range";

dayjs.extend(utc);
dayjs.extend(timezone);

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** ISO calendar date (YYYY-MM-DD) → dd/MM/yyyy for text inputs. */
export function isoDateToDisplay(iso: string): string {
  const m = iso.match(ISO_RE);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/** Parse dd/MM/yyyy (or d/M/yyyy) to ISO YYYY-MM-DD in SAST, or null if invalid. */
export function parseDisplayDateToIso(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const m = trimmed.match(DISPLAY_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = dayjs.tz(iso, LIST_FILTER_TZ);
  if (!d.isValid() || d.format("YYYY-MM-DD") !== iso) return null;
  return iso;
}

export function isValidIsoDate(iso: string): boolean {
  return parseDisplayDateToIso(isoDateToDisplay(iso)) === iso;
}

const SA_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: LIST_FILTER_TZ,
};

/** en-ZA label for a valid ISO date (for hints under the text field). */
export function formatIsoDateEnZa(iso: string): string | null {
  if (!isValidIsoDate(iso)) return null;
  const d = dayjs.tz(iso, LIST_FILTER_TZ);
  return new Intl.DateTimeFormat("en-ZA", SA_DATE_FORMAT).format(d.toDate());
}
