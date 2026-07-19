import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(relativeTime);
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export { dayjs };

export function formatDate(
  value: string | Date | null | undefined,
  pattern = "DD MMM YYYY"
): string {
  if (!value) return "—";
  return dayjs(value).format(pattern);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  pattern = "DD MMM YYYY, HH:mm"
): string {
  if (!value) return "—";
  return dayjs(value).format(pattern);
}

export function fromNow(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dayjs(value).fromNow();
}

export function getIsoWeekRange(date: string | Date = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const d = dayjs(date);
  return {
    weekStart: d.startOf("isoWeek").format("YYYY-MM-DD"),
    weekEnd: d.endOf("isoWeek").format("YYYY-MM-DD"),
  };
}
