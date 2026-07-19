import { dayjs } from "@/utils/dates";

export function getGreeting(date = new Date()): string {
  const hour = dayjs(date).hour();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}
