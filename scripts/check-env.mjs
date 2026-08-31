/**
 * P0 env validation for WorkOps go-live.
 *
 * Usage (from FleetInvoice):
 *   npm run env:check
 *
 * Exit codes:
 *   0 — required vars OK (warnings may still print)
 *   1 — missing/placeholder required vars
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

function isBlank(value) {
  return !value || !String(value).trim();
}

function isPlaceholder(value, markers) {
  if (isBlank(value)) return true;
  const v = String(value);
  return markers.some((m) => v.includes(m));
}

function hasServiceRole(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
  return (
    key.startsWith("eyJ") &&
    key !== "your-service-role-key" &&
    key.length > 40
  );
}

async function probeBucket(baseUrl, serviceKey, name) {
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
  const exists =
    Array.isArray(buckets) &&
    buckets.some((b) => b.name === name || b.id === name);
  return { ok: true, exists };
}

async function main() {
  console.log("=== WorkOps env:check (P0) ===");
  console.log("File:", ENV_PATH);

  if (!fs.existsSync(ENV_PATH)) {
    console.error("FAIL: .env.local not found");
    process.exit(1);
  }

  const env = loadEnv(ENV_PATH);
  const errors = [];
  const warnings = [];

  if (
    isPlaceholder(env.NEXT_PUBLIC_SUPABASE_URL, [
      "your-project",
      "example.supabase",
    ])
  ) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL missing or placeholder");
  } else {
    console.log("OK  NEXT_PUBLIC_SUPABASE_URL");
  }

  if (
    isPlaceholder(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, [
      "your-anon",
      "your-anon-key",
    ])
  ) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY missing or placeholder");
  } else {
    console.log("OK  NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (isBlank(env.NEXT_PUBLIC_APP_URL)) {
    errors.push("NEXT_PUBLIC_APP_URL missing");
  } else {
    console.log("OK  NEXT_PUBLIC_APP_URL =", env.NEXT_PUBLIC_APP_URL);
    if (
      env.NEXT_PUBLIC_APP_URL.includes("localhost") ||
      env.NEXT_PUBLIC_APP_URL.includes("127.0.0.1")
    ) {
      warnings.push(
        "NEXT_PUBLIC_APP_URL is localhost — set production hostname before retail deploy"
      );
    }
  }

  if (isBlank(env.NOTIFICATIONS_PROCESS_SECRET) && isBlank(env.CRON_SECRET)) {
    errors.push(
      "NOTIFICATIONS_PROCESS_SECRET (or CRON_SECRET) required to authorize outbox drain"
    );
  } else {
    console.log("OK  NOTIFICATIONS_PROCESS_SECRET / CRON_SECRET");
  }

  if (!hasServiceRole(env)) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY empty — required for outbox drain + vehicle-docs bucket"
    );
    console.log("WARN SUPABASE_SERVICE_ROLE_KEY not set");
  } else {
    console.log("OK  SUPABASE_SERVICE_ROLE_KEY");
    try {
      const bucket = await probeBucket(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        "vehicle-docs"
      );
      if (!bucket.ok) {
        warnings.push(`vehicle-docs bucket probe failed: ${bucket.error}`);
      } else if (!bucket.exists) {
        warnings.push(
          "vehicle-docs bucket missing — run npm run db:audit with service role to create"
        );
        console.log("WARN vehicle-docs bucket: missing");
      } else {
        console.log("OK  vehicle-docs bucket exists");
      }
    } catch (err) {
      warnings.push(`vehicle-docs probe error: ${err.message || err}`);
    }
  }

  if (isBlank(env.MAILERSEND_API_KEY)) {
    warnings.push(
      "MAILERSEND_API_KEY empty — invite emails will be skipped (copy-URL still works)"
    );
    console.log("WARN MAILERSEND_API_KEY not set");
  } else {
    console.log("OK  MAILERSEND_API_KEY");
  }

  if (isBlank(env.NEXT_PUBLIC_MAPBOX_TOKEN)) {
    warnings.push(
      "NEXT_PUBLIC_MAPBOX_TOKEN empty — /dispatch map will not render"
    );
    console.log("WARN NEXT_PUBLIC_MAPBOX_TOKEN not set");
  } else {
    console.log("OK  NEXT_PUBLIC_MAPBOX_TOKEN");
  }

  if (isBlank(env.YOCO_SECRET_KEY)) {
    warnings.push(
      "YOCO_SECRET_KEY empty — plan assign still works; Yoco Checkout disabled"
    );
    console.log("WARN YOCO_SECRET_KEY not set");
  } else {
    console.log("OK  YOCO_SECRET_KEY");
  }

  if (isBlank(env.YOCO_WEBHOOK_SECRET)) {
    warnings.push(
      "YOCO_WEBHOOK_SECRET empty — membership payments will not auto-activate subscriptions"
    );
    console.log("WARN YOCO_WEBHOOK_SECRET not set");
  } else {
    console.log("OK  YOCO_WEBHOOK_SECRET");
  }

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(" -", w);
  }

  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log(" -", e);
    console.log(
      "\nSee docs/runbooks/env-checklist.md — paste secrets from Supabase / MailerSend / Mapbox / Yoco."
    );
    process.exit(1);
  }

  console.log("\nenv:check passed (required vars present).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
