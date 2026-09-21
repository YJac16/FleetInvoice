import { NextResponse } from "next/server";

import { POST as processNotifications } from "@/app/api/notifications/process/route";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Weekly compliance digest: enqueue admin emails, then drain outbox.
 * Auth: Authorization: Bearer <CRON_SECRET> (same as notifications cron).
 */
export async function GET(request: Request) {
  return runComplianceDigest(request);
}

export async function POST(request: Request) {
  return runComplianceDigest(request);
}

async function runComplianceDigest(request: Request) {
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

  const withinDays = Number(process.env.COMPLIANCE_DIGEST_WITHIN_DAYS ?? "30");
  const { data: enqueued, error } = await admin.rpc(
    "enqueue_compliance_renewals_digests",
    { p_within_days: Number.isFinite(withinDays) ? withinDays : 30 }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const drain = await processNotifications(request);

  let drainBody: unknown = null;
  try {
    drainBody = await drain.clone().json();
  } catch {
    drainBody = { status: drain.status };
  }

  return NextResponse.json({
    enqueued: enqueued ?? 0,
    within_days: Number.isFinite(withinDays) ? withinDays : 30,
    drain: drainBody,
  });
}
