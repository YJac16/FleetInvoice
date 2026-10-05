import { NextResponse } from "next/server";

import {
  isAuthorizedCronBearer,
  unauthorizedCronResponse,
} from "@/lib/auth/cron-bearer";
import { isEmailDeliveryConfigured } from "@/lib/env";
import { sendResendEmail } from "@/lib/notifications/resend-server";
import { createServiceClient } from "@/lib/supabase/admin";

const DEFAULT_NOTIFICATION_SUBJECT = "GoOps notification";

type OutboxRow = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  attempts: number;
};

function notificationHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<pre style="font-family:sans-serif;white-space:pre-wrap">${escaped}</pre>`;
}

async function sendViaResend(row: OutboxRow): Promise<void> {
  const text = row.body ?? "";
  await sendResendEmail({
    to: [row.recipient],
    subject: row.subject?.trim() || DEFAULT_NOTIFICATION_SUBJECT,
    text,
    html: notificationHtml(text),
  });
}

/**
 * Drains pending notification_outbox rows.
 * Auth: Authorization: Bearer <NOTIFICATIONS_PROCESS_SECRET>
 * or CRON_SECRET for Vercel cron.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCronBearer(request)) {
    return unauthorizedCronResponse();
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 503 }
    );
  }

  const { data: rows, error } = await admin
    .from("notification_outbox")
    .select("id, channel, recipient, subject, body, attempts")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];
  const hasResend = isEmailDeliveryConfigured();

  for (const row of (rows ?? []) as OutboxRow[]) {
    await admin
      .from("notification_outbox")
      .update({ status: "processing", attempts: row.attempts + 1 })
      .eq("id", row.id);

    try {
      if (row.channel === "email" && hasResend) {
        await sendViaResend(row);
        await admin
          .from("notification_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", row.id);
        results.push({ id: row.id, status: "sent" });
      } else {
        await admin
          .from("notification_outbox")
          .update({
            status: "skipped",
            last_error: hasResend
              ? `Unsupported channel: ${row.channel}`
              : "RESEND_API_KEY not configured; invite URL still valid in app",
          })
          .eq("id", row.id);
        results.push({ id: row.id, status: "skipped" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      await admin
        .from("notification_outbox")
        .update({ status: "failed", last_error: message })
        .eq("id", row.id);
      results.push({ id: row.id, status: "failed", error: message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
