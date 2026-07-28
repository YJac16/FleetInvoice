import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";

type OutboxRow = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  attempts: number;
};

async function sendViaResend(row: OutboxRow): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "WorkOps <onboarding@resend.dev>";
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [row.recipient],
      subject: row.subject ?? "WorkOps notification",
      text: row.body ?? "",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend failed: ${response.status} ${text}`);
  }
}

/**
 * Drains pending notification_outbox rows.
 * Auth: Authorization: Bearer <NOTIFICATIONS_PROCESS_SECRET>
 * or CRON_SECRET for Vercel cron.
 */
export async function POST(request: Request) {
  const secret =
    process.env.NOTIFICATIONS_PROCESS_SECRET ?? process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const hasResend = Boolean(process.env.RESEND_API_KEY);

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
