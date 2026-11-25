export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const SAST = "Africa/Johannesburg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const sastParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: SAST,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function sastFields(value: string) {
  const dateOnly = DATE_ONLY_RE.exec(value);
  if (dateOnly) {
    return { y: dateOnly[1], m: Number(dateOnly[2]), d: dateOnly[3], time: null };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const p = Object.fromEntries(sastParts.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: p.year,
    m: Number(p.month),
    d: String(p.day).padStart(2, "0"),
    time: `${p.hour}:${p.minute}`,
  };
}

/** `dd MMM yyyy` in SAST (date-only strings are shown as-is, no timezone shift). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const f = sastFields(value);
  if (!f) return "—";
  return `${f.d} ${MONTHS[f.m - 1]} ${f.y}`;
}

/** `dd MMM yyyy HH:mm` in SAST. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const f = sastFields(value);
  if (!f) return "—";
  return `${f.d} ${MONTHS[f.m - 1]} ${f.y}${f.time ? ` ${f.time}` : ""}`;
}
