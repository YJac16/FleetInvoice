#!/usr/bin/env node
/**
 * Invoice service week bounds (SAST Mon–Sun inclusive period_end).
 * Requires: bash scripts/local-db/bootstrap-native.sh
 */
import { spawnSync } from "node:child_process";
const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
};

function psql(sql) {
  const res = spawnSync(
    "sudo",
    [
      "-u",
      "postgres",
      "psql",
      "-q",
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-c",
      sql,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "psql failed");
  }
  return (res.stdout ?? "").trim();
}

function record(id, pass, evidence) {
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

// Monday 2026-09-21 10:09 UTC (SAST still Monday morning)
const mondayTrip = "2026-09-21T10:09:00Z";
const mondayBounds = psql(
  `select period_start || ',' || period_end from public.service_week_bounds_sast('${mondayTrip}'::timestamptz);`
);
record(
  "service_week_bounds_sast_monday_trip",
  mondayBounds === "2026-09-21,2026-09-27",
  mondayBounds
);

// Sunday 2026-09-27 22:00 SAST = 20:00 UTC
const sundayTrip = "2026-09-27T20:00:00Z";
const sundayBounds = psql(
  `select period_start || ',' || period_end from public.service_week_bounds_sast('${sundayTrip}'::timestamptz);`
);
record(
  "service_week_bounds_sast_sunday_night",
  sundayBounds === "2026-09-21,2026-09-27",
  sundayBounds
);

// Mon 00:30 SAST while UTC is still Sunday evening
const sastMondayUtcSunday = "2026-09-27T22:30:00Z";
const edgeBounds = psql(
  `select period_start || ',' || period_end from public.service_week_bounds_sast('${sastMondayUtcSunday}'::timestamptz);`
);
record(
  "service_week_bounds_sast_early_monday_sast",
  edgeBounds === "2026-09-28,2026-10-04",
  edgeBounds
);

const normalize = psql(
  `select public.normalize_invoice_period_end('2026-09-21'::date, '2026-09-28'::date);`
);
record(
  "normalize_legacy_exclusive_monday",
  normalize === "2026-09-27",
  normalize
);

const upperInclusive = psql(
  `select (public.invoice_period_upper_bound_sast('2026-09-21'::date, '2026-09-27'::date) at time zone 'Africa/Johannesburg')::text;`
);
record(
  "upper_bound_after_inclusive_sunday",
  upperInclusive.startsWith("2026-09-28 00:00:00"),
  upperInclusive
);

const includesSundayTrip = psql(
  `select (
    '2026-09-27T21:59:59Z'::timestamptz >= public.invoice_period_lower_bound_sast('2026-09-21'::date)
    and '2026-09-27T21:59:59Z'::timestamptz < public.invoice_period_upper_bound_sast('2026-09-21'::date, '2026-09-27'::date)
  );`
);
record(
  "trip_window_includes_sunday_235959_sast",
  includesSundayTrip === "t",
  includesSundayTrip
);

const excludesMondayTrip = psql(
  `select (
    '2026-09-27T22:30:00Z'::timestamptz < public.invoice_period_upper_bound_sast('2026-09-21'::date, '2026-09-27'::date)
  );`
);
record(
  "trip_window_excludes_next_monday_sast",
  excludesMondayTrip === "f",
  excludesMondayTrip
);
