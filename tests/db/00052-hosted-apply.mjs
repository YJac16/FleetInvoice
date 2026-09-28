import { spawnSync } from "node:child_process";

const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

function psqlAdmin(sql, { allowError = false } = {}) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  }
  return { ok: res.status === 0, text: `${res.stderr ?? ""}${res.stdout ?? ""}`.trim() };
}

function applyMigrationFile(migrationPath) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", migrationPath],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "00052 apply failed");
  }
}

/**
 * Apply 00052 under hosted-like postgres when the cluster allows demoting postgres.
 * Many local clusters protect postgres.rolsuper; then apply as normal and return mode.
 */
export function apply00052HostedFidelity(migrationPath) {
  const demote = psqlAdmin("ALTER ROLE postgres NOSUPERUSER", { allowError: true });
  if (demote.ok) {
    try {
      applyMigrationFile(migrationPath);
      return { mode: "nosuperuser-postgres" };
    } finally {
      psqlAdmin("ALTER ROLE postgres SUPERUSER");
    }
  }
  applyMigrationFile(migrationPath);
  return {
    mode: "superuser-fallback",
    reason:
      "local cluster blocks ALTER ROLE postgres NOSUPERUSER; hosted Supabase postgres is already non-super",
  };
}

export function migrationSqlTargetsSupabaseAdmin(migrationSql) {
  const executable = migrationSql
    .replace(/--[^\n]*/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/supabase_auth_admin/g, "");
  return /\bsupabase_admin\b/i.test(executable);
}

export function defaultPrivilegesPostgresScopeOnly(migrationSql) {
  const section = migrationSql.split("4) Default privileges")[1] ?? "";
  const executable = section.replace(/--[^\n]*/gm, "");
  return (
    /alter default privileges for role postgres/i.test(executable) &&
    !/alter default privileges[\s\S]*for role\s+supabase_admin/i.test(executable)
  );
}
