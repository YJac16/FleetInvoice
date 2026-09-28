import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const port = process.env.WORKOPS_AUDIT_PG_PORT ?? "54322";
const psql = (sql) =>
  execSync(
    `PGPASSWORD=postgres psql -h 127.0.0.1 -p ${port} -U postgres -d postgres -t -A -c ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`,
    { encoding: "utf8" }
  ).trim();

const privs = psql(`
  select count(*)::text
  from information_schema.table_privileges
  where grantee = 'authenticated'
    and table_schema = 'public'
    and table_name = 'fuel_fillups'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
`);
assert.equal(privs, "0");

const fnDef = psql(`
  select pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'generate_period_invoice'
  limit 1
`);
assert.match(fnDef, /review_status = 'approved'/);

console.log("fuel-slips RLS checks ok");
