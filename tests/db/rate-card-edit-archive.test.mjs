#!/usr/bin/env node
/**
 * 00069: rate-card edit in place, backdated re-price (drafts only),
 * archive/restore RPCs and earliest unbilled trip date. Includes golden
 * invoice-line checks.
 * Requires: scripts/local-db/bootstrap-native.sh (run by this test).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(
  join(root, "supabase/migrations/00069_rate_card_edit_archive_restore.sql"),
  "utf8"
);

let failed = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failed = 1;
}

// Static checks
for (const fn of ["archive_rate_card", "restore_rate_card", "list_archived_rate_cards", "earliest_unbilled_trip_date", "apply_company_trip_rate"]) {
  check(`${fn} anon revoked`, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`).test(sql));
}
check("definer fns pin search_path", (sql.match(/security definer\s+set search_path = pg_catalog, public/g) ?? []).length >= 6);
check("re-price limited to draft invoices", /i\.status = 'draft'/.test(sql));
check("reprice helper revoked from authenticated", /revoke all on function public\.reprice_draft_trip_lines\(uuid, uuid, date\) from public, anon, authenticated/.test(sql));
check("re-price skips overridden lines", /price_overridden, false\) = false/.test(sql));

if (spawnSync("which", ["psql"]).status !== 0) {
  console.error("FAIL integration — psql not available (required)");
  process.exit(1);
}

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG = "d6900000-0000-4000-8000-000000000001";
const adminUser = "d6900000-0000-4000-8000-000000000011";
const driverUser = "d6900000-0000-4000-8000-000000000012";
const driverRow = "d6900000-0000-4000-8000-000000000201";
const companyId = "d6900000-0000-4000-8000-000000000301";
const vehicleId = "d6900000-0000-4000-8000-000000000401";
const billTo = "d6900000-0000-4000-8000-000000000501";

function psqlAdmin(body) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAs(role, userId, body, { allowError = false } = {}) {
  const sqlBody = `
BEGIN;
SET LOCAL ROLE ${role};
SET LOCAL request.jwt.claim.sub = '${userId ?? ""}';
${body}
COMMIT;
`;
  const res = spawnSync(
    "psql",
    ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sqlBody],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) throw new Error(res.stderr || res.stdout || "psqlAs failed");
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    text: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}
const asAdmin = (body, opts) => psqlAs("authenticated", adminUser, body, opts);

if (!process.env.WORKOPS_SKIP_BOOTSTRAP) {
  const bootstrap = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], { encoding: "utf8" });
  if (bootstrap.status !== 0) {
    console.error("FAIL integration — bootstrap-native.sh failed");
    console.error(bootstrap.stderr || bootstrap.stdout);
    process.exit(1);
  }
}

// Local stub: auth.uid() lives in the auth schema (same as run-pr-a-waybill-rate.sh).
psqlAdmin(`grant usage on schema auth to authenticated, anon;`);

psqlAdmin(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '${adminUser}', 'authenticated', 'authenticated', 'rc-admin@rate.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '${driverUser}', 'authenticated', 'authenticated', 'rc-driver@rate.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;
insert into public.organisations (id, name, slug, status) values ('${ORG}', 'Rate Card Org', 'rate-card-org', 'active') on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, user_id, role, status)
values ('${ORG}', '${adminUser}', 'organisation_admin', 'active'), ('${ORG}', '${driverUser}', 'driver', 'active') on conflict do nothing;
insert into public.drivers (id, organisation_id, profile_id, full_name, status) values ('${driverRow}', '${ORG}', '${driverUser}', 'RC Driver', 'active') on conflict (id) do nothing;
insert into public.companies (id, organisation_id, name, status)
values ('${companyId}', '${ORG}', 'RC Co', 'active'), ('${billTo}', '${ORG}', 'WCL Trading CC', 'active') on conflict (id) do nothing;
insert into public.vehicles (id, organisation_id, name, registration_number, status, vehicle_type)
values ('${vehicleId}', '${ORG}', 'RC Van', 'RC-001', 'active', 'other') on conflict (id) do nothing;
update public.organisations set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('invoice_bill_to_company_id', '${billTo}') where id = '${ORG}';
`);

const upsertRate = (amount, from) =>
  asAdmin(`select (public.upsert_company_with_trip_rate('${ORG}'::uuid, 'RC Co', '${companyId}'::uuid,
    null, null, null, null, null, 'active', ${amount}, date '${from}', null, null)).id::text;`);

// Initial card R440 from 1 Aug.
upsertRate(440, "2026-08-01");

const backfill = (ts) =>
  asAdmin(`select (public.backfill_staff_waybill('${ORG}'::uuid, '${driverRow}'::uuid, timestamptz '${ts}',
    'A → B', 1, '${companyId}'::uuid, null, null, null, '${vehicleId}'::uuid))::text;`).out;

const tripIssued = backfill("2026-09-10 10:00:00+02"); // week 7–13 Sep → will be issued
const tripDraft = backfill("2026-09-24 10:00:00+02"); // week 21–27 Sep → stays draft

const issuedInvoice = psqlAdmin(`select invoice_id::text from public.invoice_lines where trip_id = '${tripIssued}'`);
psqlAdmin(`update public.invoices set status = 'issued' where id = '${issuedInvoice}'`);

const line = (trip) =>
  psqlAdmin(`select unit_price::numeric(14,2)::text || '|' || amount::numeric(14,2)::text from public.invoice_lines where trip_id = '${trip}'`);
const invTotal = (trip) =>
  psqlAdmin(`select i.total::numeric(14,2)::text from public.invoices i join public.invoice_lines il on il.invoice_id = i.id where il.trip_id = '${trip}'`);
const cards = () =>
  psqlAdmin(`select string_agg(unit_amount::numeric(14,2)::text || '@' || effective_from || '..' || coalesce(effective_to::text, ''), ',' order by effective_from)
    from public.rate_cards where company_id = '${companyId}' and deleted_at is null`);

check("golden: initial issued line 440", line(tripIssued) === "440.00|440.00", line(tripIssued));
check("golden: initial draft line 440", line(tripDraft) === "440.00|440.00", line(tripDraft));
const issuedTotalBefore = invTotal(tripIssued);

// Earliest unbilled = draft trip date (the issued one is billed).
const earliest = asAdmin(`select public.earliest_unbilled_trip_date('${ORG}'::uuid, '${companyId}'::uuid)::text;`).out;
check("earliest unbilled trip date", earliest === "2026-09-24", earliest);

// 1. Same-date edit corrects in place.
upsertRate(450, "2026-08-01");
check("same-date edit: no new row", cards() === "450.00@2026-08-01..", cards());
check("golden: draft re-priced 450", line(tripDraft) === "450.00|450.00", line(tripDraft));
check("golden: issued untouched 440", line(tripIssued) === "440.00|440.00", line(tripIssued));
check("golden: issued total untouched", invTotal(tripIssued) === issuedTotalBefore, invTotal(tripIssued));
check("golden: draft invoice total 450", invTotal(tripDraft) === "450.00", invTotal(tripDraft));

// 2. Backdated new card R500 from 1 Sep: chains, re-prices draft only.
upsertRate(500, "2026-09-01");
check("backdated: chained cards", cards() === "450.00@2026-08-01..2026-08-31,500.00@2026-09-01..", cards());
check("golden: backdated draft 500", line(tripDraft) === "500.00|500.00", line(tripDraft));
check("golden: backdated issued 440", line(tripIssued) === "440.00|440.00", line(tripIssued));

// 3. Card inserted between two existing cards is bounded by the next one.
upsertRate(470, "2026-08-15");
check("mid insert: bounded", cards() === "450.00@2026-08-01..2026-08-14,470.00@2026-08-15..2026-08-31,500.00@2026-09-01..", cards());
check("golden: mid insert leaves draft 500", line(tripDraft) === "500.00|500.00", line(tripDraft));

// 4. Override lines are never re-priced.
asAdmin(`select public.set_trip_billing_override('${tripDraft}'::uuid, 123.45, 'fixed deal');`);
upsertRate(510, "2026-09-01");
check("golden: override line kept", line(tripDraft) === "123.45|123.45", line(tripDraft));
asAdmin(`select public.clear_trip_billing_override('${tripDraft}'::uuid, 'undo');`);
check("golden: cleared override → 510", line(tripDraft) === "510.00|510.00", line(tripDraft));

// 5. Archive / restore.
const card510 = psqlAdmin(`select id::text from public.rate_cards where company_id = '${companyId}' and effective_from = '2026-09-01' and deleted_at is null`);
const anonArchive = psqlAs("anon", null, `select public.archive_rate_card('${card510}'::uuid);`, { allowError: true });
check("anon cannot archive", !anonArchive.ok);
const driverArchive = psqlAs("authenticated", driverUser, `select public.archive_rate_card('${card510}'::uuid);`, { allowError: true });
check("driver cannot archive", !driverArchive.ok && /Not authorised/.test(driverArchive.text), driverArchive.text);

asAdmin(`select public.archive_rate_card('${card510}'::uuid);`);
check("archive: hidden + previous re-opened", cards() === "450.00@2026-08-01..2026-08-14,470.00@2026-08-15..", cards());
check("golden: archive re-prices draft to 470", line(tripDraft) === "470.00|470.00", line(tripDraft));
check("golden: archive leaves issued 440", line(tripIssued) === "440.00|440.00", line(tripIssued));
const archivedCount = asAdmin(`select count(*)::text from public.list_archived_rate_cards('${ORG}'::uuid);`).out;
check("list archived = 1", archivedCount === "1", archivedCount);
const driverList = psqlAs("authenticated", driverUser, `select count(*)::text from public.list_archived_rate_cards('${ORG}'::uuid);`).out;
check("driver sees no archived cards", driverList === "0", driverList);

asAdmin(`select public.restore_rate_card('${card510}'::uuid);`);
check("restore: chained again", cards() === "450.00@2026-08-01..2026-08-14,470.00@2026-08-15..2026-08-31,510.00@2026-09-01..", cards());
check("golden: restore re-prices draft 510", line(tripDraft) === "510.00|510.00", line(tripDraft));

// Restore conflicts with an active card on the same date.
asAdmin(`select public.archive_rate_card('${card510}'::uuid);`);
upsertRate(520, "2026-09-01");
const conflict = asAdmin(`select public.restore_rate_card('${card510}'::uuid);`, { allowError: true });
check("restore blocked on same-date conflict", !conflict.ok && /already starts/.test(conflict.text), conflict.text);

// Grants / overloads
const grants = psqlAdmin(`select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'execute') || ':' || has_function_privilege('authenticated', p.oid, 'execute'), ',' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('archive_rate_card','restore_rate_card','list_archived_rate_cards','earliest_unbilled_trip_date','apply_company_trip_rate','upsert_company_with_trip_rate')`);
check(
  "grants: anon none (local bootstrap re-grants all fns to authenticated, so reprice is checked statically)",
  grants === "apply_company_trip_rate:false:true,archive_rate_card:false:true,earliest_unbilled_trip_date:false:true,list_archived_rate_cards:false:true,restore_rate_card:false:true,upsert_company_with_trip_rate:false:true",
  grants
);

process.exit(failed);
