import { POST as processNotifications } from "@/app/api/notifications/process/route";

/**
 * Vercel Cron entrypoint (see vercel.json).
 * Vercel sends Authorization: Bearer <CRON_SECRET> automatically when CRON_SECRET is set.
 */
export async function GET(request: Request) {
  return processNotifications(request);
}

export async function POST(request: Request) {
  return processNotifications(request);
}
