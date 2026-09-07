import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Organisation timezone for staff transport MVP (SAST). */
export const DRIVER_TZ = "Africa/Johannesburg";

export function nowInDriverTz() {
  return dayjs().tz(DRIVER_TZ);
}

export function formatTripTime(iso: string): string {
  return dayjs(iso).tz(DRIVER_TZ).format("HH:mm");
}

export function formatDayLabel(iso: string): string {
  return dayjs(iso).tz(DRIVER_TZ).format("ddd DD MMM");
}

export function isSameDayInTz(a: string | Date, b: string | Date): boolean {
  return (
    dayjs(a).tz(DRIVER_TZ).format("YYYY-MM-DD") ===
    dayjs(b).tz(DRIVER_TZ).format("YYYY-MM-DD")
  );
}

export function todayDateString(): string {
  return nowInDriverTz().format("YYYY-MM-DD");
}

export function mondayOfWeek(date?: string | Date | dayjs.Dayjs): string {
  const d = date ? dayjs(date).tz(DRIVER_TZ) : nowInDriverTz();
  const day = d.day();
  const diff = day === 0 ? -6 : 1 - day;
  return d.add(diff, "day").format("YYYY-MM-DD");
}

export function daysOfWeek(monday: string): string[] {
  const start = dayjs(monday).tz(DRIVER_TZ);
  return Array.from({ length: 7 }, (_, i) =>
    start.add(i, "day").format("YYYY-MM-DD")
  );
}

export function weekRangeLabel(monday: string): string {
  const start = dayjs(monday).tz(DRIVER_TZ);
  const end = start.add(6, "day");
  return `${start.format("D MMM")} – ${end.format("D MMM")}`;
}

export function isTodayDate(dateStr: string): boolean {
  return dateStr === todayDateString();
}
