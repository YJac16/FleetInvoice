#!/usr/bin/env node
/**
 * Jacobs Org copy-and-verify rehearsal (00088 .. 00092 + rollback / archive
 * scripts) on a throwaway local Postgres (scripts/local-db/bootstrap-native.sh,
 * database workops_audit). Never points at a hosted project. All data is the
 * fake 00090 demo seed (@example.com, CA-DEMO-*, DEMO-ACC-*).
 *
 *   Gate A  reconciliation: per-table counts (dedupe-aware), invoice totals
 *           by bucket (draft / issued / void / void+deleted) to the cent,
 *           1:1 org_copy_map invoice identity, 0 line price mismatches,
 *           price_overridden count, active growth subscription + maintenance
 *   Gate B  access: Jacobs admin + manager read money and issuer overrides;
 *           dispatcher + supervisor read 0 finance rows; drivers see only
 *           their own trips, no price columns, cannot choose a vehicle;
 *           Cape Shuttle Ops (local stand-in) stays isolated and unchanged
 *   Gate C  per-owner issuer overrides (Yaseen / Shaheed / Freddy) distinct;
 *           audit_logs never carry account numbers
 *   Gate E  created_by / updated_by preserved by the copy; new inserts /
 *           updates from each of the 3 entry logins stamp auth.uid()
 *   Gate F  Monday run 2026-11-23..29 inside Jacobs Org, cent for cent:
 *           Yaseen 1230.00, Shaheed 1380.00, Freddy 300.00, Mountain 900.00,
 *           combined 3810.00
 *   Gate G  copied final workshop bill locked; draft editable by admin /
 *           manager, refused for dispatcher / driver
 *   Gate H  rollback-jacobs-org-copy leaves source orgs byte-identical;
 *           re-copy; archive + rollback-archive round trip; rollback-00088..
 *           00091 then re-apply 00088..00092
 *
 * Run: npm run test:jacobs-org-copy   (WORKOPS_SKIP_BOOTSTRAP=1 to reuse a DB)
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
  if (!ok) failed = 1;
};

function run(args, opts = {}) {
  return spawnSync("sudo", ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", ...args], {
    encoding: "utf8",
    ...opts,
  });
}
function admin(body) {
  const res = run(["-c", body]);
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psql failed");
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
}
function adminTry(body) {
  const res = run(["-c", body]);
  return { ok: res.status === 0, out: (res.stdout ?? "").trim(), text: `${res.stderr ?? ""}${res.stdout ?? ""}` };
}
function applyFile(rel) {
  const res = run(["-f", join(root, rel)]);
  return { ok: res.status === 0, text: `${res.stderr ?? ""}${res.stdout ?? ""}` };
}
function as(userId, body) {
  const sqlBody = `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${userId}';\n${body}\nCOMMIT;`;
  const res = spawnSync(
    "psql",
    ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sqlBody],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    rows: (res.stdout ?? "").trim().split("\n").filter(Boolean),
    text: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}
const asService = (body) => adminTry(`BEGIN;\nSET LOCAL ROLE service_role;\n${body}\nCOMMIT;`);
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------
const mig = (f) => readFileSync(join(root, "supabase/migrations", f), "utf8");
const m88 = mig("00088_owner_and_audit_columns.sql");
const m89 = mig("00089_driver_invoice_print_override.sql");
const m90 = mig("00090_demo_jacobs_source_orgs_seed.sql");
const m91 = mig("00091_jacobs_org_copy_function.sql");
const tripColumns = readFileSync(join(root, "lib/trip-columns.ts"), "utf8");
check("static: 00088 owner_tag check on drivers/vehicles/invoices", (m88.match(/owner_tag in \('yaseen', 'fadia'\)/g) ?? []).length >= 3);
check("static: 00088 preserve_audit_actor switch", /app\.preserve_audit_actor/.test(m88));
check("static: 00088 grants trips.updated_by column", /grant select \(updated_by\) on table public\.trips to authenticated/.test(m88));
check(
  "static: list_org_actor_names never allows driver/employee/company_manager",
  /array\['organisation_admin', 'manager', 'dispatcher', 'supervisor'\]/.test(m88) &&
    !/list_org_actor_names[\s\S]*'(driver|employee|company_manager)'/.test(m88.replace(/--.*$/gm, ""))
);
const policy89 = m89.slice(m89.indexOf("create policy driver_invoice_print_overrides_select"), m89.indexOf("-- No insert/update/delete policies"));
check("static: 00089 override select has no dispatcher/supervisor", !/dispatcher|supervisor/.test(policy89), policy89);
check("static: 00090 has no real-looking account numbers", !/\b(?!0+\b)\d{7,}\b/.test(m90.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")));
check("static: 00090 logins all @example.com", (m90.match(/[\w.+-]+@[\w.-]+/g) ?? []).every((e) => e.endsWith("example.com")));
check(
  "static: 00091 copy never re-prices",
  !/perform public\.(sync_staff_trip_invoice_line|suggest_trip_unit_price|generate_)/.test(
    m91.slice(0, m91.indexOf("create or replace function public.generate_driver_weekly_invoice"))
  )
);
check("static: TRIP_COLUMNS has updated_by", /\bupdated_by\b/.test(tripColumns));
check("static: TRIP_COLUMNS never has revoked price columns", !/manual_unit_price|manual_price_area_key/.test(tripColumns.split("export const")[1] ?? ""));
check(
  "static: archive script is not a migration",
  !readdirSync(join(root, "supabase/migrations")).some((f) => /archive-source-orgs|rollback-archive/.test(f))
);

if (spawnSync("which", ["psql"]).status !== 0) {
  console.error("FAIL integration — psql not available (required)");
  process.exit(1);
}
if (!process.env.WORKOPS_SKIP_BOOTSTRAP) {
  const b = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], {
    encoding: "utf8",
    env: { ...process.env, WORKOPS_AUDIT_PG_PORT: "5432" },
  });
  if (b.status !== 0) {
    console.error("FAIL bootstrap-native.sh");
    console.error(b.stderr || b.stdout);
    process.exit(1);
  }
}

// Local harness only: bootstrap's broad GRANT re-opens table-level SELECT on
// trips after the migrations; restore the hosted end state (00079 + 00088:
// every column except the two price columns).
admin(`
grant usage on schema auth to authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ') into cols
  from pg_attribute
  where attrelid = 'public.trips'::regclass and attnum > 0 and not attisdropped
    and attname not in ('manual_unit_price', 'manual_price_area_key');
  execute 'revoke select on table public.trips from authenticated';
  execute 'revoke select (manual_unit_price, manual_price_area_key) on table public.trips from authenticated';
  execute format('grant select (%s) on table public.trips to authenticated', cols);
end $$;`);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORG_Y = "5eed0000-0000-4000-8000-000000000001";
const ORG_F = "5eed0000-0000-4000-8000-000000000002";
const CAPE = "a1000000-0000-4000-8000-000000000001";
const BATCH = "5eed0000-0000-4000-8000-00000000b001";
const U = {
  yaseen: "5eed0000-0000-4000-8000-000000000101",
  faadiah: "5eed0000-0000-4000-8000-000000000102",
  clerk: "5eed0000-0000-4000-8000-000000000103",
  driverYaseen: "5eed0000-0000-4000-8000-000000000104",
  driverZain: "5eed0000-0000-4000-8000-000000000105",
  // test-only Jacobs Org members (not part of the seed)
  dispatcher: "5eed0000-0000-4000-8000-0000000001a1",
  supervisor: "5eed0000-0000-4000-8000-0000000001a2",
  capeAdmin: "5eed0000-0000-4000-8000-0000000001a3",
};

// Local stand-in for Cape Shuttle Ops (exists on goops-demo; not in the local
// migration chain). Only used to prove the copy never touches it.
admin(`
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '${U.dispatcher}', 'authenticated', 'authenticated', 'jacobs-test-dispatcher@example.com', '{}', '{"full_name":"Test Dispatcher"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '${U.supervisor}', 'authenticated', 'authenticated', 'jacobs-test-supervisor@example.com', '{}', '{"full_name":"Test Supervisor"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '${U.capeAdmin}', 'authenticated', 'authenticated', 'cape-test-admin@example.com', '{}', '{"full_name":"Cape Test Admin"}', now(), now())
on conflict (id) do nothing;
insert into public.organisations (id, name, slug, status) values ('${CAPE}', 'Cape Shuttle Ops', 'cape-shuttle-ops-local', 'active')
on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, user_id, role, status) values ('${CAPE}', '${U.capeAdmin}', 'organisation_admin', 'active')
on conflict do nothing;
insert into public.companies (id, organisation_id, name, status) values ('a1000000-0000-4000-8000-0000000000c1', '${CAPE}', 'Cape Demo Client', 'active')
on conflict (id) do nothing;
insert into public.trips (id, organisation_id, company_id, planned_start, status, is_staff_transport, area_text)
values ('a1000000-0000-4000-8000-0000000000d1', '${CAPE}', 'a1000000-0000-4000-8000-0000000000c1', '2026-11-24 08:00+02', 'completed', true, 'Cape A -> Cape B')
on conflict (id) do nothing;
`);

// Checksum helper (test schema only): md5 per org-scoped table for one org.
admin(`
create schema if not exists jacobs_test;
create or replace function jacobs_test.org_checksum(p_org uuid, p_skip text[] default '{}')
returns jsonb language plpgsql as $$
declare r record; v text; out jsonb := '{}'::jsonb;
begin
  for r in
    select c.relname::text as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r' and c.relname::text <> all (p_skip)
    order by 1
  loop
    execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from public.%I t where organisation_id = $1', r.t)
      into v using p_org;
    out := out || jsonb_build_object(r.t, v);
  end loop;
  if not ('organisations' = any (p_skip)) then
    select md5(o::text) into v from public.organisations o where o.id = p_org;
    out := out || jsonb_build_object('organisations', v);
  end if;
  return out;
end $$;`);
const checksum = (org, skip = []) =>
  JSON.parse(admin(`select jacobs_test.org_checksum('${org}', array[${skip.map((s) => `'${s}'`).join(",") || "''"}]::text[])::text`));
const diffKeys = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);

const before = { y: checksum(ORG_Y), f: checksum(ORG_F), cape: checksum(CAPE) };

const J = admin(`select id from public.organisations where slug = 'jacobs-org'`);
check("00092 created Jacobs Org", /^[0-9a-f-]{36}$/.test(J), J);
if (!J) {
  console.error("jacobs-org-copy: FAILED (no Jacobs Org)");
  process.exit(1);
}
admin(`insert into public.organisation_members (organisation_id, user_id, role, status) values
  ('${J}', '${U.dispatcher}', 'dispatcher', 'active'),
  ('${J}', '${U.supervisor}', 'supervisor', 'active') on conflict do nothing;`);

const id = (sql) => admin(sql);
const jDriver = (name) => id(`select id from public.drivers where organisation_id = '${J}' and full_name = '${name}'`);
const jCompany = (name) => id(`select id from public.companies where organisation_id = '${J}' and name = '${name}'`);

// ---------------------------------------------------------------------------
// Gate A — reconciliation
// ---------------------------------------------------------------------------
const SRC = `array['${ORG_Y}', '${ORG_F}']::uuid[]`;
const noDedupe = [
  "trips", "trip_assignments", "trip_events", "trip_audit", "trip_billing_overrides", "invoices", "invoice_lines",
  "rate_cards", "pay_rates", "routes", "driver_vehicle_assignments", "driver_invoice_print_overrides",
  "workshop_bills", "workshop_bill_lines", "audit_logs",
];
for (const t of noDedupe) {
  const s = admin(`select count(*) from public.${t} where organisation_id = any (${SRC})`);
  const d = admin(`select count(*) from public.${t} where organisation_id = '${J}'`);
  check(`A: ${t} count ${s} = ${d}`, s === d && Number(s) > 0, `${s} vs ${d}`);
}
for (const [t, expected] of [["companies", 6], ["drivers", 5], ["vehicles", 4], ["suppliers", 1], ["maintenance_categories", 1], ["route_prices", 1]]) {
  const d = admin(`select count(*) from public.${t} where organisation_id = '${J}'`);
  const mapped = admin(`select count(distinct new_id) from public.org_copy_map where batch_id = '${BATCH}' and source_table = '${t}'`);
  const srcRows = admin(`select count(*) from public.${t} where organisation_id = any (${SRC})`);
  const mapRows = admin(`select count(*) from public.org_copy_map where batch_id = '${BATCH}' and source_table = '${t}'`);
  check(`A: ${t} deduped to ${expected} (map ${mapRows} source rows -> ${mapped})`, Number(d) === expected && d === mapped && srcRows === mapRows, `${d}/${mapped}/${srcRows}/${mapRows}`);
}
check(
  "A: Demo WCL Trading CC deduped and bill-to remapped",
  admin(`select c.name from public.organisations o join public.companies c on c.id::text = o.settings->>'invoice_bill_to_company_id' and c.organisation_id = o.id where o.id = '${J}'`) === "Demo WCL Trading CC"
);
for (const [label, where] of [
  ["draft", "status = 'draft' and deleted_at is null"],
  ["issued", "status = 'issued' and deleted_at is null"],
  ["void", "status = 'void' and deleted_at is null"],
  ["void+deleted", "status = 'void' and deleted_at is not null"],
]) {
  const q = (org) => admin(`select count(*) || '/' || coalesce(sum(total), 0)::numeric(14,2) || '/' || coalesce(sum(subtotal), 0)::numeric(14,2) from public.invoices where organisation_id ${org} and ${where}`);
  const s = q(`= any (${SRC})`);
  const d = q(`= '${J}'`);
  check(`A: ${label} invoices count/total/subtotal ${s}`, s === d && !s.startsWith("0/"), `${s} vs ${d}`);
}
check(
  "A: void+deleted invoice copied with 0 lines",
  admin(`select count(*) from public.invoices i where i.organisation_id = '${J}' and i.status = 'void' and i.deleted_at is not null and not exists (select 1 from public.invoice_lines l where l.invoice_id = i.id)`) === "1"
);
check(
  "A: org_copy_map invoices 1:1 with identical header",
  admin(`
    select count(*) from public.invoices s
    join public.org_copy_map m on m.batch_id = '${BATCH}' and m.source_table = 'invoices' and m.source_id = s.id
    join public.invoices t on t.id = m.new_id and t.organisation_id = '${J}'
    where s.organisation_id = any (${SRC})
      and (s.status, s.issued_at, s.paid_at, s.period_start, s.period_end, s.notes, s.subtotal, s.total, s.deleted_at, s.generated_by, s.updated_by, s.owner_tag)
        is not distinct from
          (t.status, t.issued_at, t.paid_at, t.period_start, t.period_end, t.notes, t.subtotal, t.total, t.deleted_at, t.generated_by, t.updated_by, t.owner_tag)`) ===
    admin(`select count(*) from public.invoices where organisation_id = any (${SRC})`) &&
    admin(`select count(distinct new_id) from public.org_copy_map where batch_id = '${BATCH}' and source_table = 'invoices'`) ===
      admin(`select count(*) from public.invoices where organisation_id = '${J}'`)
);
check(
  "A: 0 invoice_lines price mismatches",
  admin(`
    select count(*) from public.invoice_lines s
    join public.org_copy_map m on m.batch_id = '${BATCH}' and m.source_table = 'invoice_lines' and m.source_id = s.id
    join public.invoice_lines t on t.id = m.new_id
    where s.organisation_id = any (${SRC})
      and (s.unit_price, s.amount, s.quantity, s.price_overridden, s.override_reason, s.rate_effective_on, s.priced_area_key, s.description)
        is distinct from
          (t.unit_price, t.amount, t.quantity, t.price_overridden, t.override_reason, t.rate_effective_on, t.priced_area_key, t.description)`) === "0"
);
check(
  "A: invoice_lines FKs point inside Jacobs Org",
  admin(`
    select count(*) from public.invoice_lines l
    left join public.invoices i on i.id = l.invoice_id
    left join public.trips t on t.id = l.trip_id
    left join public.rate_cards rc on rc.id = l.rate_card_id
    left join public.route_prices rp on rp.id = l.route_price_id
    where l.organisation_id = '${J}'
      and (i.organisation_id <> '${J}' or (l.trip_id is not null and t.organisation_id is distinct from '${J}')
        or (l.rate_card_id is not null and rc.organisation_id is distinct from '${J}')
        or (l.route_price_id is not null and rp.organisation_id is distinct from '${J}'))`) === "0"
);
const overriddenS = admin(`select count(*) from public.invoice_lines where price_overridden and organisation_id = any (${SRC})`);
check("A: price_overridden line count matches", overriddenS === admin(`select count(*) from public.invoice_lines where price_overridden and organisation_id = '${J}'`) && Number(overriddenS) >= 2, overriddenS);
check(
  "A: manual trip prices preserved",
  admin(`select coalesce(sum(manual_unit_price), 0) || '/' || count(manual_price_area_key) from public.trips where organisation_id = any (${SRC})`) ===
    admin(`select coalesce(sum(manual_unit_price), 0) || '/' || count(manual_price_area_key) from public.trips where organisation_id = '${J}'`)
);
check(
  "A: Jacobs Org active growth subscription with maintenance",
  admin(`select count(*) from public.subscriptions s join public.plans p on p.id = s.plan_id join public.module_entitlements me on me.plan_id = p.id where s.organisation_id = '${J}' and s.status = 'active' and p.code = 'growth' and me.module_key = 'maintenance'`) === "1"
);
check("A: Demo Fadia Org still has no subscription", admin(`select count(*) from public.subscriptions where organisation_id = '${ORG_F}'`) === "0");
check(
  "A: memberships = unique users, highest role",
  admin(`select string_agg(p.email || '=' || m.role, ',' order by p.email) from public.organisation_members m join public.profiles p on p.id = m.user_id where m.organisation_id = '${J}' and m.user_id::text like '5eed%' and m.user_id not in ('${U.dispatcher}', '${U.supervisor}')`) ===
    "demo-jacobs-clerk@example.com=manager,demo-jacobs-driver-yaseen@example.com=driver,demo-jacobs-driver-zain@example.com=driver,demo-jacobs-faadiah@example.com=organisation_admin,demo-jacobs-yaseen@example.com=organisation_admin"
);
check(
  "A: owner_tag preserved (2 yaseen + 3 fadia drivers, 2+2 vehicles)",
  admin(`select (select string_agg(owner_tag || count, ',' order by owner_tag) from (select owner_tag, count(*) from public.drivers where organisation_id = '${J}' group by 1) x) || ';' || (select string_agg(owner_tag || count, ',' order by owner_tag) from (select owner_tag, count(*) from public.vehicles where organisation_id = '${J}' group by 1) y)`) ===
    "fadia3,yaseen2;fadia2,yaseen2"
);
check(
  "A: audit_logs entity ids remapped into Jacobs Org",
  admin(`select count(*) from public.audit_logs a where a.organisation_id = '${J}' and a.entity_type = 'invoice' and not exists (select 1 from public.invoices i where i.id = a.entity_id and i.organisation_id = '${J}')`) === "0"
);
check("A: notification_outbox / invitations not copied", admin(`select (select count(*) from public.notification_outbox where organisation_id = '${J}') + (select count(*) from public.invitations where organisation_id = '${J}')`) === "0");

// ---------------------------------------------------------------------------
// Gate B — access & security
// ---------------------------------------------------------------------------
const countAs = (u, table, extra = "") => as(u, `select count(*) from public.${table} where organisation_id = '${J}' ${extra};`);
for (const [who, u] of [["admin (Yaseen)", U.yaseen], ["manager (Clerk)", U.clerk]]) {
  for (const t of ["invoices", "invoice_lines", "rate_cards", "route_prices", "workshop_bills", "driver_invoice_print_overrides"]) {
    const r = countAs(u, t);
    check(`B: ${who} reads ${t}`, r.ok && Number(r.out) > 0, r.text);
  }
  const names = as(u, `select count(*) from public.list_org_actor_names('${J}') where display_name in ('Demo Yaseen Jacobs', 'Demo Faadiah Jacobs', 'Demo Ops Clerk');`);
  check(`B: ${who} resolves 3 entry-login names`, names.ok && names.out === "3", names.text);
}
for (const [who, u] of [["dispatcher", U.dispatcher], ["supervisor", U.supervisor]]) {
  for (const t of ["invoices", "invoice_lines", "rate_cards", "route_prices", "workshop_bills", "driver_invoice_print_overrides", "pay_rates"]) {
    const r = countAs(u, t);
    check(`B: ${who} reads 0 ${t}`, r.ok && r.out === "0", r.text);
  }
  const names = as(u, `select count(*) from public.list_org_actor_names('${J}');`);
  check(`B: ${who} may resolve actor names`, names.ok && Number(names.out) > 0, names.text);
}
{
  const own = as(U.driverYaseen, `select count(*) from public.trips where organisation_id = '${J}';`);
  const expected = admin(`select count(*) from public.trips t join public.trip_assignments ta on ta.trip_id = t.id and ta.released_at is null and ta.deleted_at is null join public.drivers d on d.id = ta.driver_id where t.organisation_id = '${J}' and d.profile_id = '${U.driverYaseen}'`);
  check(`B: driver sees only own trips (${own.out} = ${expected})`, own.ok && own.out === expected && Number(expected) > 0, own.text);
  const price = as(U.driverYaseen, `select manual_unit_price from public.trips where organisation_id = '${J}' limit 1;`);
  check("B: driver cannot select trip prices", !price.ok && /permission denied/.test(price.text), price.text);
  for (const t of ["invoices", "invoice_lines", "rate_cards", "driver_invoice_print_overrides"]) {
    const r = countAs(U.driverYaseen, t);
    check(`B: driver reads 0 ${t}`, r.ok && r.out === "0", r.text);
  }
  const names = as(U.driverYaseen, `select count(*) from public.list_org_actor_names('${J}');`);
  check("B: driver cannot resolve actor names", !names.ok && /Not authorised/.test(names.text), names.text);
  check(
    "B: submit_driver_trip takes no vehicle argument",
    !/vehicle/i.test(admin(`select pg_get_function_arguments('public.submit_driver_trip'::regproc)`))
  );
  const sub = as(
    U.driverYaseen,
    `select trip_id from public.submit_driver_trip('${J}', '2026-12-02 07:00+02', 'Demo Acme Depot', 'Demo Acme Office', '${jCompany("Demo Acme Logistics")}', 2, 12, 'B gate');`
  );
  check("B: Jacobs driver can self-submit a trip", sub.ok && /^[0-9a-f-]{36}$/.test(sub.out), sub.text);
  if (sub.ok) {
    const veh = admin(`select coalesce(v.registration_number, '(none)') || '|' || t.created_by || '|' || t.updated_by from public.trips t join public.trip_assignments ta on ta.trip_id = t.id left join public.vehicles v on v.id = ta.vehicle_id where t.id = '${sub.out}'`);
    // 00065/00066: the driver never picks a vehicle; an admin sets it on approval.
    check("B: self-submitted trip has no driver-chosen vehicle, stamped by the driver", veh === `(none)|${U.driverYaseen}|${U.driverYaseen}`, veh);
    const appr = as(U.clerk, `select (public.approve_driver_trip('${sub.out}', '${id(`select id from public.vehicles where organisation_id = '${J}' and registration_number = 'CA-DEMO-Y1'`)}')).id;`);
    check("B: manager approves with the vehicle; updated_by = manager", appr.ok && admin(`select created_by || '|' || updated_by || '|' || approved_by from public.trips where id = '${sub.out}'`) === `${U.driverYaseen}|${U.clerk}|${U.clerk}`, appr.text);
  }
  const cape = as(U.yaseen, `select (select count(*) from public.trips where organisation_id = '${CAPE}') + (select count(*) from public.companies where organisation_id = '${CAPE}');`);
  check("B: Jacobs admin sees 0 Cape Shuttle Ops rows", cape.ok && cape.out === "0", cape.text);
  const capeAdmin = as(U.capeAdmin, `select count(*) from public.trips where organisation_id = '${J}';`);
  check("B: Cape admin sees 0 Jacobs Org rows", capeAdmin.ok && capeAdmin.out === "0", capeAdmin.text);
}

// ---------------------------------------------------------------------------
// Gate C — per-owner issuer overrides
// ---------------------------------------------------------------------------
{
  const rows = as(
    U.yaseen,
    `select d.full_name || '|' || coalesce(o.settings #>> '{supplier,name}', o.settings #>> '{contact,name}') || '|' || (o.settings #>> '{banking,bank}') || '|' || (o.settings #>> '{banking,account_number}')
     from public.driver_invoice_print_overrides o join public.drivers d on d.id = o.driver_id
     where o.organisation_id = '${J}' order by d.full_name;`
  );
  check(
    "C: Yaseen / Shaheed / Freddy issuer blocks distinct",
    rows.ok &&
      rows.rows.join(";") ===
        "Freddy Demo|Demo Mansur Logistics|DEMO-NEDBANK|DEMO-ACC-3003;Shaheed Demo|Demo Shaheed Transport|DEMO-ABSA|DEMO-ACC-2002;Yaseen Demo|Demo Yaseen Transport|DEMO-FNB|DEMO-ACC-1001",
    rows.text
  );
  const set = as(
    U.yaseen,
    `select public.set_driver_invoice_print_override('${jDriver("Freddy Demo")}', ${j({
      contact: { name: "Demo Mansur Logistics" },
      banking: { bank: "DEMO-NEDBANK", account_name: "Demo Mansur Logistics", account_number: "DEMO-ACC-3003", branch_code: "DEMO-BR-3" },
    })});`
  );
  check("C: Jacobs admin re-saves Freddy override via RPC", set.ok, set.text);
  const mgr = as(U.clerk, `select public.set_driver_invoice_print_override('${jDriver("Freddy Demo")}', '{}'::jsonb);`);
  check("C: manager cannot write overrides", !mgr.ok && /Only organisation admins/.test(mgr.text), mgr.text);
  check(
    "C: audit_logs never contain account numbers",
    admin(`select count(*) from public.audit_logs where metadata::text ~* 'DEMO-ACC|account_number|DEMO-BR-'`) === "0"
  );
}

// ---------------------------------------------------------------------------
// Gate F — Monday run (before Gate E adds trips)
// ---------------------------------------------------------------------------
{
  check("F: no invoices for 2026-11-23 week before the run", admin(`select count(*) from public.invoices where organisation_id = '${J}' and period_start = '2026-11-23'`) === "0");
  const gen = (name) =>
    as(U.yaseen, `select id || '|' || total || '|' || status from public.generate_driver_weekly_invoice('${J}', '${jDriver(name)}', '2026-11-23', '2026-11-29');`);
  const results = {};
  for (const [name, total] of [["Yaseen Demo", "1230.00"], ["Shaheed Demo", "1380.00"], ["Freddy Demo", "300.00"]]) {
    const r = gen(name);
    results[name] = r.out.split("|")[0];
    check(`F: ${name} driver week = ${total}`, r.ok && r.out.split("|")[1] === total && r.out.endsWith("draft"), r.text);
  }
  const mtn = as(U.clerk, `select id || '|' || total from public.generate_period_invoice('${J}', '${jCompany("Demo Mountain Co")}', '2026-11-23', '2026-11-29');`);
  check("F: Demo Mountain Co period = 900.00 (manager)", mtn.ok && mtn.out.split("|")[1] === "900.00", mtn.text);
  const lines = admin(`
    select string_agg(d.full_name || ':' || l.amount || ':' || l.price_overridden || ':' || coalesce(l.override_reason, '-') || ':' || (l.route_price_id is not null), ',' order by d.full_name, l.amount)
    from public.invoice_lines l join public.invoices i on i.id = l.invoice_id join public.drivers d on d.id = i.driver_id
    where i.organisation_id = '${J}' and i.period_start = '2026-11-23'`);
  check(
    "F: line for line",
    lines ===
      "Freddy Demo:300.00:false:-:false,Shaheed Demo:300.00:false:-:false,Shaheed Demo:440.00:false:-:false,Shaheed Demo:640.00:true:Executive transfer:false,Yaseen Demo:300.00:false:-:false,Yaseen Demo:410.00:true:-:true,Yaseen Demo:520.00:true:-:false",
    lines
  );
  check(
    "F: combined 3810.00",
    admin(`select sum(total) from public.invoices where organisation_id = '${J}' and period_start = '2026-11-23' and deleted_at is null and status <> 'void'`) === "3810.00"
  );
  check(
    "F: Mountain invoice has 2 x 450",
    admin(`select string_agg(amount::text, ',') from public.invoice_lines where invoice_id = '${mtn.out.split("|")[0]}'`) === "450.00,450.00"
  );
  const again = gen("Yaseen Demo");
  check("F: re-run returns the existing invoice untouched", again.ok && again.out === `${results["Yaseen Demo"]}|1230.00|draft`, again.text);
  check(
    "F: generated_by / updated_by stamped with the caller",
    admin(`select count(*) from public.invoices where organisation_id = '${J}' and period_start = '2026-11-23' and driver_id is not null and (generated_by <> '${U.yaseen}' or updated_by <> '${U.yaseen}')`) === "0"
  );
  const disp = as(U.dispatcher, `select total from public.generate_driver_weekly_invoice('${J}', '${jDriver("Zain Demo")}', '2026-11-23', '2026-11-29');`);
  check("F: dispatcher cannot generate", !disp.ok && /Not authorised/.test(disp.text), disp.text);
}

// ---------------------------------------------------------------------------
// Gate E — entry audit
// ---------------------------------------------------------------------------
{
  check(
    "E: copied trips keep created_by / updated_by / approved_by",
    admin(`
      select count(*) from public.trips s
      join public.org_copy_map m on m.batch_id = '${BATCH}' and m.source_table = 'trips' and m.source_id = s.id
      join public.trips t on t.id = m.new_id
      where (s.created_by, s.updated_by, s.approved_by, s.created_at) is distinct from (t.created_by, t.updated_by, t.approved_by, t.created_at)`) === "0"
  );
  check(
    "E: Jacobs trips entered by all 3 entry logins",
    admin(`select count(distinct created_by) from public.trips where organisation_id = '${J}' and created_by in ('${U.yaseen}', '${U.faadiah}', '${U.clerk}')`) === "3"
  );
  const acme = jCompany("Demo Acme Logistics");
  const made = {};
  let day = 1;
  for (const [who, u] of [["Yaseen", U.yaseen], ["Faadiah", U.faadiah], ["Clerk", U.clerk]]) {
    const r = as(
      u,
      `select public.backfill_staff_waybill('${J}', '${jDriver("Freddy Demo")}', '2026-12-0${day++} 07:00+02', 'Demo Acme Depot -> Demo Acme Office', 2, '${acme}', null, 100, 120, '${id(`select id from public.vehicles where organisation_id = '${J}' and registration_number = 'CA-DEMO-F2'`)}');`
    );
    made[who] = r.out;
    check(`E: ${who} enters a waybill`, r.ok && /^[0-9a-f-]{36}$/.test(r.out), r.text);
    if (r.ok) {
      check(`E: ${who} stamped created_by + updated_by`, admin(`select created_by || '|' || updated_by from public.trips where id = '${r.out}'`) === `${u}|${u}`);
    }
  }
  if (made.Yaseen) {
    const up = as(U.clerk, `select (public.update_staff_trip('${made.Yaseen}', p_pax_count => 3, p_edit_reason => 'E gate')).id;`);
    check("E: Clerk edits Yaseen's trip", up.ok, up.text);
    check("E: edit stamps updated_by = Clerk, created_by stays Yaseen", admin(`select created_by || '|' || updated_by from public.trips where id = '${made.Yaseen}'`) === `${U.yaseen}|${U.clerk}`);
  }
  const cap = asService(`select public.save_driver_capture('${U.faadiah}', '${J}', null, ${j({ full_name: "Owner Tag Test", owner_tag: "fadia" })})::text;`);
  check("E: save_driver_capture persists owner_tag + actor", cap.ok && admin(`select owner_tag || '|' || created_by || '|' || updated_by from public.drivers where full_name = 'Owner Tag Test'`) === `fadia|${U.faadiah}|${U.faadiah}`, cap.text);
  const bad = asService(`select public.save_driver_capture('${U.faadiah}', '${J}', null, ${j({ full_name: "Bad Owner", owner_tag: "someone" })})::text;`);
  check("E: save_driver_capture rejects unknown owner_tag", !bad.ok && /invalid_owner_tag/.test(bad.text), bad.text);
  const veh = asService(`select public.save_vehicle_capture('${U.clerk}', '${J}', '${id(`select id from public.vehicles where organisation_id = '${J}' and registration_number = 'CA-DEMO-F2'`)}', ${j({ name: "Demo Hiace F2", registration_number: "CA-DEMO-F2", owner_tag: "yaseen" })})::text;`);
  check("E: save_vehicle_capture updates owner_tag + updated_by", veh.ok && admin(`select owner_tag || '|' || updated_by from public.vehicles where organisation_id = '${J}' and registration_number = 'CA-DEMO-F2'`) === `yaseen|${U.clerk}`, veh.text);
}

// ---------------------------------------------------------------------------
// Gate G — maintenance on Jacobs Org
// ---------------------------------------------------------------------------
{
  const finalBill = id(`select id from public.workshop_bills where organisation_id = '${J}' and invoice_ref = 'DEMO-WS-001'`);
  const draftBill = id(`select id from public.workshop_bills where organisation_id = '${J}' and invoice_ref = 'DEMO-WS-002'`);
  const supplier = id(`select id from public.suppliers where organisation_id = '${J}'`);
  check("G: copied final bill is approved + locked fields kept", admin(`select status || '|' || approved_by || '|' || (approved_at is not null) from public.workshop_bills where id = '${finalBill}'`) === `approved|${U.yaseen}|true`);
  const payload = (ref) => j({ supplier_id: supplier, bill_date: "2026-11-19", invoice_ref: ref, notes: "G gate", lines: [{ description: "Demo part", unit_amount: 100 }] });
  for (const [who, u] of [["admin", U.yaseen], ["manager", U.clerk]]) {
    const e = asService(`select public.save_workshop_bill('${u}', '${J}', '${finalBill}', ${payload("DEMO-WS-001")})::text;`);
    check(`G: ${who} cannot edit final bill`, !e.ok && /bill_approved_locked/.test(e.text), e.text);
    const d = asService(`select public.delete_workshop_bill('${u}', '${J}', '${finalBill}');`);
    check(`G: ${who} cannot delete final bill`, !d.ok && /bill_not_draft|bill_approved_locked/.test(d.text), d.text);
    const ok = asService(`select public.save_workshop_bill('${u}', '${J}', '${draftBill}', ${payload("DEMO-WS-002")})::text;`);
    check(`G: ${who} edits draft bill`, ok.ok, ok.text);
  }
  const direct = adminTry(`update public.workshop_bills set notes = 'x' where id = '${finalBill}';`);
  check("G: direct update of final bill blocked by trigger", !direct.ok && /bill_approved_locked/.test(direct.text), direct.text);
  for (const [who, u] of [["dispatcher", U.dispatcher], ["driver", U.driverYaseen]]) {
    const e = asService(`select public.save_workshop_bill('${u}', '${J}', '${draftBill}', ${payload("DEMO-WS-002")})::text;`);
    check(`G: ${who} cannot edit draft bill`, !e.ok, e.text);
    const r = as(u, `update public.workshop_bills set notes = 'x' where id = '${draftBill}' returning 1;`);
    check(`G: ${who} cannot update draft bill directly`, (r.ok && r.out === "") || /permission denied/.test(r.text), r.text);
  }
}

// ---------------------------------------------------------------------------
// Gate H — rollback, re-copy, archive round trip
// ---------------------------------------------------------------------------
{
  const rb = applyFile("supabase/rollback-jacobs-org-copy.sql");
  check("H: rollback-jacobs-org-copy.sql runs", rb.ok, rb.text);
  check("H: Jacobs Org gone", admin(`select count(*) from public.organisations where slug = 'jacobs-org'`) === "0");
  check("H: batch removed from org_copy_map", admin(`select count(*) from public.org_copy_map where batch_id = '${BATCH}'`) === "0");
  check("H: no rows left for the deleted org id", admin(`select count(*) from public.trips where organisation_id = '${J}'`) === "0" && admin(`select count(*) from public.organisation_members where organisation_id = '${J}'`) === "0");
  for (const [k, org] of [["y", ORG_Y], ["f", ORG_F], ["cape", CAPE]]) {
    const after = checksum(org);
    const diff = diffKeys(before[k], after);
    check(`H: ${k === "cape" ? "Cape Shuttle Ops" : k === "y" ? "Demo Yaseen Org" : "Demo Fadia Org"} byte-identical (${Object.keys(after).length} tables)`, diff.length === 0, diff.join(","));
  }

  const again = adminTry(`select public.copy_orgs_to_jacobs_org(${SRC}, 'Jacobs Org', 'jacobs-org', '${BATCH}');`);
  check("H: re-copy succeeds", again.ok && /^[0-9a-f-]{36}$/.test(again.out), again.text);
  const dup = adminTry(`select public.copy_orgs_to_jacobs_org(${SRC}, 'Jacobs Org', 'jacobs-org');`);
  check("H: second copy to same slug refused", !dup.ok && /already exists/.test(dup.text), dup.text);
  const noAuth = as(U.yaseen, `select public.copy_orgs_to_jacobs_org(${SRC}, 'X', 'x-org');`);
  check("H: copy not callable by authenticated users", !noAuth.ok && /permission denied|service role only/.test(noAuth.text), noAuth.text);
  // Even with EXECUTE re-granted (as a careless GRANT ALL would), a JWT caller is refused.
  admin(`grant execute on function public.copy_orgs_to_jacobs_org(uuid[], text, text, uuid) to authenticated;`);
  const granted = as(U.yaseen, `select public.copy_orgs_to_jacobs_org(${SRC}, 'X', 'x-org');`);
  admin(`revoke execute on function public.copy_orgs_to_jacobs_org(uuid[], text, text, uuid) from authenticated;`);
  check("H: copy refuses a JWT caller even if EXECUTE is granted", !granted.ok && /service role only/.test(granted.text), granted.text);
  check("H: no x-org created", admin(`select count(*) from public.organisations where slug = 'x-org'`) === "0");

  const arch = applyFile("supabase/archive-source-orgs-jacobs.sql");
  check("H: archive-source-orgs-jacobs.sql passes reconciliation and runs", arch.ok, arch.text);
  check(
    "H: source orgs archived (inactive + deleted_at)",
    admin(`select count(*) from public.organisations where id in ('${ORG_Y}', '${ORG_F}') and status = 'inactive' and deleted_at is not null`) === "2"
  );
  check(
    "H: source memberships suspended + deleted_at",
    admin(`select count(*) from public.organisation_members where organisation_id in ('${ORG_Y}', '${ORG_F}') and (status <> 'suspended' or deleted_at is null)`) === "0"
  );
  check("H: Jacobs memberships still active", admin(`select count(*) from public.organisation_members m join public.organisations o on o.id = m.organisation_id where o.slug = 'jacobs-org' and m.status = 'active' and m.deleted_at is null`) === "5");
  const blocked = applyFile("supabase/rollback-jacobs-org-copy.sql");
  check("H: rollback-jacobs-org-copy refuses while sources archived", !blocked.ok && /archived/.test(blocked.text), blocked.text);
  const unarch = applyFile("supabase/rollback-archive-source-orgs.sql");
  check("H: rollback-archive-source-orgs.sql runs", unarch.ok, unarch.text);
  check("H: source orgs active again", admin(`select count(*) from public.organisations where id in ('${ORG_Y}', '${ORG_F}') and status = 'active' and deleted_at is null`) === "2");
  check(
    "H: source memberships restored",
    admin(`select count(*) from public.organisation_members where organisation_id in ('${ORG_Y}', '${ORG_F}') and status = 'active' and deleted_at is null`) === "7"
  );
  for (const [k, org] of [["y", ORG_Y], ["f", ORG_F]]) {
    const skip = ["organisations", "organisation_members"];
    const diff = diffKeys(checksum(org, skip), Object.fromEntries(Object.entries(before[k]).filter(([t]) => !skip.includes(t))));
    check(`H: ${k} data unchanged by archive round trip`, diff.length === 0, diff.join(","));
  }

  // Rollback scripts 00088..00091, then re-apply the migrations.
  for (const f of ["supabase/rollback-jacobs-org-copy.sql", "supabase/rollback-00090.sql", "supabase/rollback-00091.sql", "supabase/rollback-00089.sql", "supabase/rollback-00088.sql"]) {
    const r = applyFile(f);
    check(`H: ${f} runs`, r.ok, r.text);
  }
  check("H: demo source orgs + users removed", admin(`select (select count(*) from public.organisations where id in ('${ORG_Y}', '${ORG_F}')) + (select count(*) from auth.users where email like 'demo-jacobs-%')`) === "0");
  check("H: owner_tag / updated_by columns dropped", admin(`select count(*) from information_schema.columns where table_schema = 'public' and column_name in ('owner_tag', 'updated_by') and table_name in ('drivers', 'vehicles', 'invoices', 'trips', 'rate_cards', 'route_prices', 'workshop_bills')`) === "0");
  for (const f of [
    "00088_owner_and_audit_columns.sql",
    "00089_driver_invoice_print_override.sql",
    "00090_demo_jacobs_source_orgs_seed.sql",
    "00091_jacobs_org_copy_function.sql",
    "00092_demo_jacobs_org_copy_run.sql",
  ]) {
    const r = applyFile(`supabase/migrations/${f}`);
    check(`H: re-apply ${f}`, r.ok, r.text);
  }
  check("H: Cape Shuttle Ops untouched by all rollbacks + re-apply", diffKeys(before.cape, checksum(CAPE)).length === 0, diffKeys(before.cape, checksum(CAPE)).join(","));
  check("H: Jacobs Org recreated by re-applied 00092", admin(`select count(*) from public.organisations where slug = 'jacobs-org'`) === "1");
}

admin(`drop schema if exists jacobs_test cascade;`);

if (failed) {
  console.error("jacobs-org-copy: FAILED");
  process.exit(1);
}
console.log("jacobs-org-copy: all checks passed");
