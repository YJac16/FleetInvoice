/**
 * Audit WorkOps schema + ops against a live Supabase project.
 *
 * Usage (from FleetInvoice):
 *   node scripts/audit-supabase.mjs
 *
 * Requires .env.local with real NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
 * (and SUPABASE_SERVICE_ROLE_KEY for bucket create / privileged checks).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function isPlaceholder(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return (
    !url ||
    url.includes("your-project") ||
    !anon ||
    anon === "your-anon-key" ||
    anon.includes("your-anon")
  );
}

async function restGet(baseUrl, key, table, select = "id") {
  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, ok: res.ok, body, text };
}

async function ensureBucket(baseUrl, serviceKey, name, options = {}) {
  const listRes = await fetch(`${baseUrl.replace(/\/$/, "")}/storage/v1/bucket`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!listRes.ok) {
    return { ok: false, error: await listRes.text() };
  }
  const buckets = await listRes.json();
  if (Array.isArray(buckets) && buckets.some((b) => b.name === name || b.id === name)) {
    return { ok: true, existed: true };
  }
  const createRes = await fetch(`${baseUrl.replace(/\/$/, "")}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: name,
      name,
      public: options.public === true,
      file_size_limit: options.fileSizeLimit,
      allowed_mime_types: options.allowedMimeTypes,
    }),
  });
  if (!createRes.ok) {
    return { ok: false, error: await createRes.text() };
  }
  return { ok: true, existed: false };
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const report = {
    url: env.NEXT_PUBLIC_SUPABASE_URL || null,
    configured: !isPlaceholder(env),
    tables: {},
    bucket: null,
    errors: [],
  };

  console.log("=== WorkOps Supabase audit ===");
  console.log("URL:", report.url);

  if (!report.configured) {
    report.errors.push(
      "Placeholders in .env.local — set NEXT_PUBLIC_SUPABASE_ANON_KEY (and preferably SUPABASE_SERVICE_ROLE_KEY) from Project Settings → API"
    );
    console.error(report.errors[0]);
    fs.writeFileSync(
      path.join(ROOT, "scripts", "audit-report.json"),
      JSON.stringify(report, null, 2)
    );
    process.exit(2);
  }

  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY?.startsWith("eyJ") &&
    env.SUPABASE_SERVICE_ROLE_KEY !== "your-service-role-key"
      ? env.SUPABASE_SERVICE_ROLE_KEY
      : env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const tables = [
    "organisations",
    "profiles",
    "member_scopes",
    "audit_logs",
    "notification_outbox",
    "vehicle_documents",
    "drivers",
    "routes",
    "route_stops",
    "schedules",
    "trips",
    "trip_assignments",
    "trip_events",
    "fuel_fillups",
    "invoices",
    "invoice_lines",
    "qr_tokens",
    "attendance_events",
    "gps_points",
    "gps_last_positions",
    "geofences",
    "geofence_events",
    "rate_cards",
    "pay_rates",
    "payroll_runs",
    "payroll_lines",
  ];

  for (const table of tables) {
    const result = await restGet(base, key, table);
    const missing =
      result.status === 404 ||
      (typeof result.text === "string" &&
        (result.text.includes("Could not find the table") ||
          result.text.includes("PGRST205")));
    report.tables[table] = {
      status: result.status,
      present: !missing && result.status < 500,
      missing,
    };
    console.log(
      `  ${table}: ${missing ? "MISSING" : `ok (${result.status})`}`
    );
  }

  const phase0Missing = ["member_scopes", "audit_logs", "notification_outbox"].some(
    (t) => report.tables[t]?.missing
  );
  const phase2Missing = report.tables.vehicle_documents?.missing;
  const phase3Missing = ["routes", "route_stops", "schedules", "trips"].some(
    (t) => report.tables[t]?.missing
  );
  const phase4Missing = ["trip_assignments", "trip_events"].some(
    (t) => report.tables[t]?.missing
  );
  const phase5Missing = ["fuel_fillups", "invoices", "invoice_lines"].some(
    (t) => report.tables[t]?.missing
  );
  const phase6Missing = ["qr_tokens", "attendance_events"].some(
    (t) => report.tables[t]?.missing
  );
  const phase7Missing = [
    "gps_points",
    "gps_last_positions",
    "geofences",
    "geofence_events",
  ].some((t) => report.tables[t]?.missing);
  const phase8Missing = report.tables.rate_cards?.missing;
  const phase8PayrollMissing = ["pay_rates", "payroll_runs", "payroll_lines"].some(
    (t) => report.tables[t]?.missing
  );

  report.recommendations = [];
  if (phase0Missing) {
    report.recommendations.push("Apply supabase/migrations/00002_phase0_hardening.sql");
  }
  if (phase2Missing) {
    report.recommendations.push("Apply supabase/migrations/00003_phase2_master_data.sql");
  }
  if (phase3Missing) {
    report.recommendations.push("Apply supabase/migrations/00004_phase3_routes_scheduling.sql");
  }
  if (phase4Missing) {
    report.recommendations.push(
      "Apply supabase/migrations/00005_phase4_trip_status_enum.sql (commit alone), then 00006_phase4_driver_portal.sql"
    );
  }
  if (phase5Missing) {
    report.recommendations.push(
      "Apply supabase/migrations/00007_phase5_fuel_and_invoices.sql"
    );
  }
  if (phase6Missing) {
    report.recommendations.push(
      "Apply supabase/migrations/00008_phase6_employee_qr_attendance.sql"
    );
  }
  if (phase7Missing) {
    report.recommendations.push(
      "Apply supabase/migrations/00009_phase7_gps_and_dispatch.sql"
    );
  }
  if (phase8Missing) {
    report.recommendations.push(
      "Apply supabase/migrations/00010_phase8_invoice_enums.sql (commit alone), then 00011_phase8_billing.sql"
    );
  }
  if (phase8PayrollMissing) {
    report.recommendations.push(
      "Apply supabase/migrations/00012_phase8_payroll.sql"
    );
  }

  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (service && service.startsWith("eyJ") && service !== "your-service-role-key") {
    const bucket = await ensureBucket(base, service, "vehicle-docs");
    report.bucket = bucket;
    console.log(
      "  vehicle-docs bucket:",
      bucket.ok
        ? bucket.existed
          ? "exists"
          : "created"
        : `FAILED ${bucket.error}`
    );
    const avatars = await ensureBucket(base, service, "avatars", {
      public: true,
      fileSizeLimit: 2097152,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });
    report.avatarsBucket = avatars;
    console.log(
      "  avatars bucket:",
      avatars.ok
        ? avatars.existed
          ? "exists"
          : "created"
        : `FAILED ${avatars.error}`
    );
  } else {
    report.bucket = { skipped: true, reason: "no service role key" };
    console.log("  vehicle-docs bucket: skipped (set SUPABASE_SERVICE_ROLE_KEY)");
    console.log("  avatars bucket: skipped (set SUPABASE_SERVICE_ROLE_KEY)");
    report.recommendations.push(
      "P0: set SUPABASE_SERVICE_ROLE_KEY then re-run db:audit to create vehicle-docs and avatars"
    );
  }

  if (
    !env.NOTIFICATIONS_PROCESS_SECRET &&
    !env.CRON_SECRET
  ) {
    report.recommendations.push(
      "P0: set NOTIFICATIONS_PROCESS_SECRET for POST /api/notifications/process"
    );
  }
  if (!env.RESEND_API_KEY) {
    report.recommendations.push(
      "P0 optional: set RESEND_API_KEY for invite email delivery"
    );
  }
  if (!env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    report.recommendations.push(
      "P0 optional: set NEXT_PUBLIC_MAPBOX_TOKEN for /dispatch map"
    );
  }

  if (report.recommendations.length) {
    console.log("\nRecommendations:");
    for (const r of report.recommendations) console.log(" -", r);
  } else {
    console.log("\nSchema tables through Phase 8 payroll MVP appear present.");
  }

  fs.writeFileSync(
    path.join(ROOT, "scripts", "audit-report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log("\nWrote scripts/audit-report.json");
  process.exit(report.recommendations.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
