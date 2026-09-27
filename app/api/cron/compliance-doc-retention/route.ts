import { NextResponse } from "next/server";

import {
  isAuthorizedCronBearer,
  unauthorizedCronResponse,
} from "@/lib/auth/cron-bearer";
import { processComplianceStoragePurgeQueue } from "@/lib/compliance/process-storage-purge-queue";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Compliance document retention (superseded / temp / orphan markers).
 * Scheduled daily at 01:00 UTC via vercel.json.
 * Auth: Authorization: Bearer CRON_SECRET or NOTIFICATIONS_PROCESS_SECRET.
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

  let purgeStats = { processed: 0, removed: 0, failed: 0 };
  try {
    purgeStats = await processComplianceStoragePurgeQueue(admin);
  } catch {
    return NextResponse.json({ error: "storage_purge_failed" }, { status: 500 });
  }

  return NextResponse.json({ result: data, storage_purge: purgeStats });
}
