import { NextResponse } from "next/server";

import {
  isAuthorizedCronBearer,
  unauthorizedCronResponse,
} from "@/lib/auth/cron-bearer";
import {
  DEFAULT_DMPR_FUEL_PRICE_URL,
  DMPR_SOURCE,
  parseDmprRelease,
} from "@/lib/fuel/dmpr";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Weekly: fetch + parse the official DMPR (formerly DMRE) monthly retail fuel
 * price release and insert GLOBAL PENDING rows (coastal + inland, four
 * grades). Nothing is confirmed or applied here: an organisation_admin /
 * manager / platform owner confirms them per org on /fuel.
 *
 * Idempotent: ingest_global_fuel_prices skips an existing
 * (type, region, effective_from). On fetch / parse / insert failure it
 * changes nothing and sends an in-app notice to finance and platform owners.
 * Auth: Authorization: Bearer <CRON_SECRET> (same as other crons).
 */
export async function GET(request: Request) {
  return runFuelPrices(request);
}

export async function POST(request: Request) {
  return runFuelPrices(request);
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

async function fail(admin: ServiceClient, reason: string, status = 502) {
  const { data, error } = await admin.rpc("notify_fuel_price_ingest_failure", {
    p_message: `Fuel price update failed: ${reason}.`,
  });
  return NextResponse.json(
    {
      ok: false,
      reason,
      inserted: 0,
      notified: error ? 0 : Number(data ?? 0),
      ...(error ? { notify_error: error.message } : {}),
    },
    { status }
  );
}

async function runFuelPrices(request: Request) {
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

  const url = process.env.DMPR_FUEL_PRICE_URL || DEFAULT_DMPR_FUEL_PRICE_URL;

  let html: string;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return fail(admin, `release page returned HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return fail(admin, `could not fetch the release page (${e instanceof Error ? e.name : "error"})`);
  }

  const parsed = parseDmprRelease(html);
  if (!parsed.ok) return fail(admin, parsed.reason);

  const { data, error } = await admin.rpc("ingest_global_fuel_prices", {
    p_rows: parsed.rows,
    p_source: DMPR_SOURCE,
  });
  if (error) return fail(admin, `could not save prices (${error.message})`, 500);

  return NextResponse.json({
    ok: true,
    effective_from: parsed.effectiveFrom,
    parsed: parsed.rows.length,
    inserted: Number(data ?? 0),
  });
}
