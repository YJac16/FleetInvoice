import { resolveDateRange } from "@/lib/date-range/sast-range";

/** Staff trips for the driver Today board — always SAST today, never URL range params. */
export function driverTodayStaffTripRange(now = new Date()): {
  from: string;
  toExclusive: string;
} {
  const range = resolveDateRange("today", null, null, now);
  return { from: range.from, toExclusive: range.toExclusive };
}
