#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const PG = { database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit" };

function psql(sql) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psql failed");
  return (res.stdout ?? "").trim();
}

function record(id, pass, evidence) {
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

const returnType = psql(`
  select pg_get_function_result(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'generate_driver_weekly_invoice'
    and p.proargtypes::text = '2950 2950 1082 1082';
`);
record(
  "MIG00051-return-type-invoices",
  returnType === "invoices",
  returnType
);

const hasNormalize = psql(`
  select count(*)::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'normalize_invoice_period_end';
`);
record("MIG00051-helpers-installed", hasNormalize === "1", `normalize=${hasNormalize}`);

const bounds = psql(`
  select period_start || ',' || period_end
  from public.service_week_bounds_sast('2026-09-21T10:09:00Z'::timestamptz);
`);
record(
  "MIG00051-service-week-inclusive-sunday",
  bounds === "2026-09-21,2026-09-27",
  bounds
);
