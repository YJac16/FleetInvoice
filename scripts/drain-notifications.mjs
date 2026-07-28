/**
 * Manually drain notification_outbox via the Next.js process route.
 *
 * Usage (app must be running, e.g. npm run dev):
 *   npm run notifications:drain
 *   npm run notifications:drain -- http://localhost:3000
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_APP_URL (or pass base URL as argv)
 *   NOTIFICATIONS_PROCESS_SECRET (or CRON_SECRET)
 *   SUPABASE_SERVICE_ROLE_KEY (server needs this for the route to work)
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

async function main() {
  const env = loadEnv(ENV_PATH);
  const base =
    process.argv[2] ||
    env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const secret =
    env.NOTIFICATIONS_PROCESS_SECRET || env.CRON_SECRET || "";

  if (!secret) {
    console.error(
      "FAIL: set NOTIFICATIONS_PROCESS_SECRET (or CRON_SECRET) in .env.local"
    );
    process.exit(1);
  }

  const url = `${base.replace(/\/$/, "")}/api/notifications/process`;
  console.log("POST", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
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

  console.log("Status:", res.status);
  console.log(typeof body === "string" ? body : JSON.stringify(body, null, 2));
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
