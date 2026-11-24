#!/usr/bin/env node
/**
 * GoOps refocus step 3 — migration 00076:
 *   (a) 'passengers' allowed by module_entitlements_key_check (list == APP_MODULES)
 *   (b) org_entitled_modules fallback == FAIL_OPEN_MODULES (no portal,
 *       passengers or maintenance), member / platform-owner gate kept
 *   (c) Starter +billing -portal; Growth and Scale -portal (no maintenance grant)
 *
 * Static checks always run. Integration checks need local Postgres
 * (workops_audit via scripts/local-db/bootstrap-native.sh). Never points at a
 * hosted project.
 *
 * Run: npm run test:migration-00076
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = join(root, "supabase/migrations/00076_goops_entitlements.sql");
const ROLLBACK = join(root, "supabase/rollback-00076.sql");
const sql = readFileSync(MIGRATION, "utf8");
const sqlCode = sql.replace(/--.*$/gm, "");
const entitlementsTs = readFileSync(join(root, "lib/entitlements.ts"), "utf8");

let failures = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failures += 1;
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ---------------------------------------------------------------------------
// Code source of truth
// ---------------------------------------------------------------------------

function tsArray(name) {
  const m = entitlementsTs.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`could not find ${name} in lib/entitlements.ts`);
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}
const APP_MODULES = tsArray("APP_MODULES");
const NEVER_FAIL_OPEN = tsArray("NEVER_FAIL_OPEN");
const FAIL_OPEN = APP_MODULES.filter((m) => !NEVER_FAIL_OPEN.includes(m));

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------

const checkList = sqlCode.match(/module_entitlements_key_check check \(\s*module_key in \(([\s\S]*?)\)\s*\)/);
const keyList = checkList ? [...checkList[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
check("static constraint list equals APP_MODULES", same(keyList, APP_MODULES), JSON.stringify(keyList));
check("static constraint allows passengers", keyList.includes("passengers"));

const fallback = sqlCode.match(/coalesce\([\s\S]*?\),\s*array\[([\s\S]*?)\]::text\[\]/);
const fallbackList = fallback ? [...fallback[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
check("static fallback equals FAIL_OPEN_MODULES", same(fallbackList, FAIL_OPEN), JSON.stringify(fallbackList));
for (const m of ["portal", "passengers", "maintenance"]) {
  check(`static fallback excludes ${m}`, fallbackList.length > 0 && !fallbackList.includes(m));
}

const fns = [...sqlCode.matchAll(/create or replace function\s+public\.([a-z_]+)/gi)].map((x) => x[1]);
check("static only org_entitled_modules is (re)defined", same(fns, ["org_entitled_modules"]), JSON.stringify(fns));
check(
  "static 00057 helpers untouched",
  !/\b(company_user_can_see|has_company_scope|is_company_manager|guard_company_manager_member_scope)\b/.test(sqlCode)
);
check("static no policy changes", !/\b(create|drop|alter) policy\b/i.test(sqlCode));
check(
  "static no price / rate data",
  !/\b(monthly_price_cents|included_vehicles|extra_vehicle_cents|max_vehicles|stripe_price_id|rate_cards|route_price\w*|invoice\w*)\b/.test(
    sqlCode
  )
);
check("static no update of plans", !/\bupdate\s+public\.plans\b/i.test(sqlCode));
check("static pins search_path", /security definer\s+set search_path = pg_catalog, public/.test(sqlCode));
check("static keeps member gate", /public\.is_platform_owner\(\) or public\.is_org_member\(p_organisation_id\)/.test(sqlCode));
check(
  "static anon revoked, authenticated granted",
  /revoke all on function public\.org_entitled_modules\(uuid\) from public, anon;/.test(sqlCode) &&
    /grant execute on function public\.org_entitled_modules\(uuid\) to authenticated, service_role;/.test(sqlCode)
);
check("static no passengers plan row", !/\('[a-z]+',\s*'passengers'\)/.test(sqlCode));

const rollback = readFileSync(ROLLBACK, "utf8").replace(/--.*$/gm, "");
check(
  "static rollback restores 00060 fallback with portal",
  /array\[\s*'core',\s*'gps',\s*'attendance',\s*'billing',\s*'payroll',\s*'reports',\s*'portal'\s*\]::text\[\]/.test(rollback)
);
check(
  "static rollback deletes passengers rows before narrowing constraint",
  rollback.indexOf("module_key = 'passengers'") > -1 &&
    rollback.indexOf("module_key = 'passengers'") < rollback.indexOf("add constraint module_entitlements_key_check")
);

// ---------------------------------------------------------------------------
// Integration (local Postgres only)
// ---------------------------------------------------------------------------

function finish() {
  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

if (process.env.WORKOPS_STATIC_ONLY) {
  console.log("SKIP integration — WORKOPS_STATIC_ONLY set");
  finish();
} else {
  if (spawnSync("which", ["psql"]).status !== 0) {
    console.error("FAIL integration — psql not available (set WORKOPS_STATIC_ONLY=1 to run static checks only)");
    process.exit(1);
  }

  const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

  if (!process.env.WORKOPS_SKIP_BOOTSTRAP) {
    const b = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], { encoding: "utf8" });
    if (b.status !== 0) {
      console.error("FAIL integration — bootstrap-native.sh failed");
      console.error(b.stderr || b.stdout);
      process.exit(1);
    }
  }

  const psqlFile = (file) =>
    spawnSync("sudo", ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", file], {
      encoding: "utf8",
    });
  function psqlRaw(body) {
    const res = spawnSync(
      "sudo",
      ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
      { encoding: "utf8" }
    );
    return {
      ok: res.status === 0,
      out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
      err: `${res.stderr ?? ""}${res.stdout ?? ""}`,
    };
  }
  function psqlAdmin(body) {
    const r = psqlRaw(body);
    if (!r.ok) throw new Error(r.err);
    return r.out;
  }
  /** Run as a signed-in user (auth.uid() from request.jwt.claim.sub). */
  function asUser(userId, body) {
    return psqlRaw(
      `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${userId}';\n${body}\nCOMMIT;`
    );
  }
  const pgArray = (s) => (s === "{}" || s === "" ? [] : s.replace(/^\{|\}$/g, "").split(","));

  // 1. Idempotent: bootstrap already applied 00076 once; apply twice more.
  for (const n of [1, 2]) {
    const r = psqlFile(MIGRATION);
    check(`re-apply 00076 (#${n}) succeeds`, r.status === 0, r.stderr);
  }

  // Seeded by scripts/local-db/seed-audit-fixtures.sql
  const ORG_A = "a0000000-0000-4000-8000-000000000001";
  const ORG_B = "b0000000-0000-4000-8000-000000000001";
  const platformOwner = "f0000000-0000-4000-8000-000000000001";
  const adminA = "a0000000-0000-4000-8000-000000000011";
  const adminB = "b0000000-0000-4000-8000-000000000011";
  const SCRATCH_PLAN = "e7600000-0000-4000-8000-000000000901";

  // 2. Constraint
  psqlAdmin(
    `insert into public.plans (id, code, name) values ('${SCRATCH_PLAN}', 'm76-scratch', 'm76 scratch') on conflict (id) do nothing;`
  );
  const okPassengers = psqlRaw(
    `insert into public.module_entitlements (plan_id, module_key) values ('${SCRATCH_PLAN}', 'passengers') on conflict do nothing;`
  );
  check("constraint accepts passengers", okPassengers.ok, okPassengers.err);
  const bogus = psqlRaw(
    `insert into public.module_entitlements (plan_id, module_key) values ('${SCRATCH_PLAN}', 'bogus');`
  );
  check("constraint rejects bogus", !bogus.ok && bogus.err.includes("module_entitlements_key_check"), bogus.err);
  psqlAdmin(`delete from public.plans where id = '${SCRATCH_PLAN}';`);

  // 3. Plan entitlements
  const planMods = (code) =>
    pgArray(
      psqlAdmin(
        `select coalesce(array_agg(e.module_key order by e.module_key), '{}')::text
         from public.plans p join public.module_entitlements e on e.plan_id = p.id where p.code = '${code}'`
      )
    );
  const STARTER = ["core", "gps", "reports", "billing"];
  const GROWTH = ["core", "gps", "attendance", "billing", "payroll", "reports"];
  const SCALE = [...GROWTH, "white_label", "sso", "integrations", "ai"];
  for (const [code, expected] of [
    ["starter", STARTER],
    ["growth", GROWTH],
    ["scale", SCALE],
  ]) {
    const got = planMods(code);
    check(`plan ${code} entitlements`, same(got, expected), JSON.stringify(got));
    check(`plan ${code} has no portal / passengers`, !got.includes("portal") && !got.includes("passengers"));
  }

  // 4. Fallback: ORG_B with no subscription, then with a past_due one.
  const modsAs = (user, org) => {
    const r = asUser(user, `select public.org_entitled_modules('${org}'::uuid)::text;`);
    if (!r.ok) throw new Error(r.err);
    return pgArray(r.out);
  };
  psqlAdmin(`delete from public.subscriptions where organisation_id = '${ORG_B}';`);
  let got = modsAs(adminB, ORG_B);
  check("fallback (no subscription) equals FAIL_OPEN_MODULES", same(got, FAIL_OPEN), JSON.stringify(got));
  for (const m of NEVER_FAIL_OPEN) check(`fallback (no subscription) excludes ${m}`, !got.includes(m));

  psqlAdmin(`
    insert into public.subscriptions (organisation_id, plan_id, status)
    select '${ORG_B}', p.id, 'past_due' from public.plans p where p.code = 'scale';`);
  got = modsAs(adminB, ORG_B);
  check("fallback (past_due subscription) equals FAIL_OPEN_MODULES", same(got, FAIL_OPEN), JSON.stringify(got));

  // 5. Plan path: ORG_A on growth.
  psqlAdmin(`
    insert into public.subscriptions (organisation_id, plan_id, status)
    select '${ORG_A}', p.id, 'active' from public.plans p where p.code = 'growth'
    on conflict (organisation_id) do update set plan_id = excluded.plan_id, status = excluded.status;`);
  got = modsAs(adminA, ORG_A);
  check("growth org gets plan modules", same(got, GROWTH), JSON.stringify(got));
  check("growth org excludes maintenance and portal", !got.includes("maintenance") && !got.includes("portal"));

  // 6. Gate kept.
  got = modsAs(adminB, ORG_A);
  check("non-member gets empty array", got.length === 0, JSON.stringify(got));
  got = modsAs(platformOwner, ORG_A);
  check("platform owner gets org's plan modules", same(got, GROWTH), JSON.stringify(got));

  // 7. Grants (after re-apply, so bootstrap's broad grants don't count).
  const grant = (role) =>
    psqlAdmin(`select has_function_privilege('${role}', 'public.org_entitled_modules(uuid)', 'execute')::text`);
  check("anon cannot execute org_entitled_modules", grant("anon") === "false");
  check("authenticated can execute org_entitled_modules", grant("authenticated") === "true");

  finish();
}
