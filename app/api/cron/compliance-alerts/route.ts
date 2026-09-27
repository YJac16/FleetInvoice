import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Daily in-app compliance expiry alerts (60/30/7/expired).
 * Auth: Authorization: Bearer <CRON_SECRET> (same as other crons).
 */
export async function GET(request: Request) {
  return runComplianceAlerts(request);
}

export async function POST(request: Request) {
  return runComplianceAlerts(request);
}

async function runComplianceAlerts(request: Request) {
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

  const { data: created, error } = await admin.rpc(
    "enqueue_compliance_expiry_alerts"
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications_created: created ?? 0 });
}
