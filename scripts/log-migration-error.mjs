/**
 * Capture a Supabase/Postgres migration error for WorkOps debug session e63f84.
 *
 * Usage (from FleetInvoice folder):
 *   node scripts/log-migration-error.mjs "paste the full error message here"
 *   node scripts/log-migration-error.mjs --file path/to/error.txt
 */
const fs = require("node:fs");
const path = require("node:path");

const ENDPOINT =
  "http://127.0.0.1:7573/ingest/c6a65bf2-f8bb-4c23-96f3-83636cd9e631";
const SESSION = "e63f84";
const LOG_PATH = path.join(__dirname, "..", "..", "debug-e63f84.log");

function classify(errorText) {
  const text = errorText.toLowerCase();
  const hits = [];
  if (
    text.includes("unsafe use of new value") ||
    (text.includes("enum") && text.includes("supervisor")) ||
    (text.includes("enum") && text.includes("company_manager"))
  ) {
    hits.push("A");
  }
  if (
    text.includes("already exists") &&
    (text.includes("notification_channel") ||
      text.includes("notification_status") ||
      text.includes("type"))
  ) {
    hits.push("B");
  }
  if (text.includes("already exists") && text.includes("policy")) {
    hits.push("C");
  }
  if (
    text.includes("has_company_scope") ||
    text.includes("function") && text.includes("does not exist")
  ) {
    hits.push("D");
  }
  if (
    text.includes("duplicate key") ||
    text.includes("unique") ||
    text.includes("could not create unique index")
  ) {
    hits.push("E");
  }
  if (text.includes("trigger") && text.includes("already exists")) {
    hits.push("F");
  }
  return hits.length ? hits : ["UNKNOWN"];
}

async function main() {
  let errorText = "";
  const fileFlag = process.argv.indexOf("--file");
  if (fileFlag >= 0 && process.argv[fileFlag + 1]) {
    errorText = fs.readFileSync(process.argv[fileFlag + 1], "utf8");
  } else {
    errorText = process.argv.slice(2).join(" ").trim();
  }

  if (!errorText) {
    console.error(
      'Provide the Supabase error text.\nExample: node scripts/log-migration-error.mjs "ERROR: ..."'
    );
    process.exit(1);
  }

  const hypothesisIds = classify(errorText);
  const payload = {
    sessionId: SESSION,
    runId: "migration-fail-1",
    hypothesisId: hypothesisIds.join(","),
    location: "scripts/log-migration-error.mjs",
    message: "Captured migration failure from Supabase",
    data: {
      hypothesisIds,
      errorPreview: errorText.slice(0, 2000),
      migrationFiles: [
        "00002_phase0_hardening.sql",
        "00003_phase2_master_data.sql",
      ],
    },
    timestamp: Date.now(),
  };

  fs.appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`, "utf8");

  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": SESSION,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // ingest optional; local NDJSON is enough
  }

  console.log("Logged. Matched hypotheses:", hypothesisIds.join(", "));
  console.log("Wrote:", LOG_PATH);
}

main();
