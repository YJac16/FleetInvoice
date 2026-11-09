/** Header clock zone. Always Africa/Johannesburg, never the device zone. */
export const PORTAL_CLOCK_TIME_ZONE = "Africa/Johannesburg";

export type PortalClockParts = {
  dateLine: string;
  timeLine: string;
  label: string;
};

const clockFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeZone: PORTAL_CLOCK_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return parts.find((entry) => entry.type === type)?.value ?? "";
}

/** Date and time for the portal header. No seconds — the clock ticks once a minute. */
export function formatPortalClock(date: Date): PortalClockParts {
  const parts = clockFormatter.formatToParts(date);
  const dateLine = `${part(parts, "day")} ${part(parts, "month")}`.trim();
  const timeLine = `${part(parts, "hour")}:${part(parts, "minute")}`;
  return {
    dateLine,
    timeLine,
    label: `${dateLine}, ${timeLine}`,
  };
}
