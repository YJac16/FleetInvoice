import { NextResponse } from "next/server";

import {
  isAuthorizedCronBearer,
  unauthorizedCronResponse,
} from "@/lib/auth/cron-bearer";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Compliance document retention (superseded / temp / orphan markers).
 * Not scheduled in vercel.json — manual/cron-secret only.
 */
export async function GET(request: Request) {
  return runRetention(request);
}

export async function POST(request: Request) {
  return runRetention(request);
}

async function runRetention(request: Request) {
  if (!isAuthorizedCronBearer(request)) {
    return unauthorizedCronResponse();
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("run_compliance_document_retention");
  if (error) {
    return NextResponse.json({ error: "retention_failed" }, { status: 500 });
  }

  return NextResponse.json({ result: data });
}
