#!/usr/bin/env node
/**
 * Local harness: drain compliance_storage_purge_queue using Storage-API-style deletes
 * (sets storage.allow_object_delete for supabase_storage_admin role).
 */
import { spawnSync } from "node:child_process";

const useSudo = process.env.WORKOPS_AUDIT_PG_USE_SUDO === "1";
const PGHOST = process.env.WORKOPS_AUDIT_PG_HOST ?? "127.0.0.1";
const PGPORT = process.env.WORKOPS_AUDIT_PG_PORT ?? "5432";
const PGUSER = process.env.WORKOPS_AUDIT_PG_SUPERUSER ?? "postgres";
const PGPASSWORD = process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "postgres";
const PGDATABASE = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

function psql(sql) {
  const baseArgs = ["-q", "-d", PGDATABASE, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql];
  const res = useSudo
    ? spawnSync("sudo", ["-u", "postgres", "psql", ...baseArgs], { encoding: "utf8" })
    : spawnSync(
        "psql",
        ["-h", PGHOST, "-p", PGPORT, "-U", PGUSER, ...baseArgs],
        { env: { ...process.env, PGPASSWORD }, encoding: "utf8" }
      );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "psql failed");
  }
  return (res.stdout ?? "").trim();
}

const pending = psql(`
  select coalesce(json_agg(row_to_json(t)), '[]'::json)::text
  from (
    select id::text, bucket_id, storage_path
    from public.compliance_storage_purge_queue
    where purged_at is null
    order by queued_at
    limit 200
  ) t;
`);

const rows = JSON.parse(pending || "[]");
if (rows.length === 0) {
  console.log("storage purge queue empty");
  process.exit(0);
}

for (const row of rows) {
  const path = row.storage_path.replace(/'/g, "''");
  const bucket = (row.bucket_id || "vehicle-docs").replace(/'/g, "''");
  psql(`
    begin;
    set local role supabase_storage_admin;
    select set_config('storage.allow_object_delete', 'true', true);
    delete from storage.objects where bucket_id = '${bucket}' and name = '${path}';
    reset role;
    update public.compliance_storage_purge_queue
    set purged_at = timezone('utc', now()), last_error = null
    where id = '${row.id}'::uuid and purged_at is null;
    commit;
  `);
}

console.log(`processed ${rows.length} queued storage purge(s)`);
