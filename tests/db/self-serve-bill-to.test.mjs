#!/usr/bin/env node
/**
 * 00070: self-serve invoice bill-to. Admin-only setter, same-org + active
 * company checks, DRAFT driver-week invoices re-targeted, issued/paid/void
 * untouched, anon revoked, no overloads.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(join(root, "supabase/migrations/00070_self_serve_invoice_bill_to.sql"), "utf8");

let failed = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failed = 1;
}

for (const fn of ["set_org_invoice_bill_to", "get_org_invoice_bill_to"]) {
  check(`${fn} anon revoked`, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`).test(sql));
}
check("definer fns pin search_path", (sql.match(/security definer\s+set search_path = pg_catalog, public/g) ?? []).length === 2);
check("setter checks organisation_admin only", /has_org_role_names\(p_organisation_id, array\['organisation_admin'\]\)/.test(sql) && !/'manager'/.test(sql));
check("re-target limited to draft", /i\.status = 'draft'/.test(sql));

if (spawnSync("which", ["psql"]).status !== 0) {
  console.error("FAIL integration — psql not available (required)");
  process.exit(1);
}

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};


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


const ORG = "d7000000-0000-4000-8000-000000000001", ORG2 = "d7000000-0000-4000-8000-000000000002";
const admin = "d7000000-0000-4000-8000-000000000011", manager = "d7000000-0000-4000-8000-000000000012", outsider = "d7000000-0000-4000-8000-000000000013";
const driverRow = "d7000000-0000-4000-8000-000000000201";
const wcl = "d7000000-0000-4000-8000-000000000301", newBill = "d7000000-0000-4000-8000-000000000302", inactive = "d7000000-0000-4000-8000-000000000303", otherOrgCo = "d7000000-0000-4000-8000-000000000304", client = "d7000000-0000-4000-8000-000000000305";
const inv = { draft: "d7000000-0000-4000-8000-000000000601", issued: "d7000000-0000-4000-8000-000000000602", paid: "d7000000-0000-4000-8000-000000000603", void: "d7000000-0000-4000-8000-000000000604", deletedDraft: "d7000000-0000-4000-8000-000000000605", companyDraft: "d7000000-0000-4000-8000-000000000606" };

psqlAdmin(`grant usage on schema auth to authenticated, anon;`);
psqlAdmin(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u || '@billto.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'
from unnest(array['${admin}','${manager}','${outsider}']::uuid[]) u
on conflict (id) do nothing;
insert into public.organisations (id, name, slug, status) values
  ('${ORG}', 'BillTo Org', 'billto-org', 'active'), ('${ORG2}', 'Other Org', 'billto-other', 'active') on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, user_id, role, status) values
  ('${ORG}', '${admin}', 'organisation_admin', 'active'),
  ('${ORG}', '${manager}', 'manager', 'active'),
  ('${ORG2}', '${outsider}', 'organisation_admin', 'active') on conflict do nothing;
insert into public.drivers (id, organisation_id, full_name, status) values ('${driverRow}', '${ORG}', 'BT Driver', 'active') on conflict (id) do nothing;
insert into public.companies (id, organisation_id, name, status) values
  ('${wcl}', '${ORG}', 'WCL Trading CC', 'active'),
  ('${newBill}', '${ORG}', 'New Bill-To', 'active'),
  ('${inactive}', '${ORG}', 'Sleepy Co', 'inactive'),
  ('${client}', '${ORG}', 'Client Co', 'active'),
  ('${otherOrgCo}', '${ORG2}', 'Foreign Co', 'active') on conflict (id) do nothing;
insert into public.invoices (id, organisation_id, company_id, driver_id, period_start, period_end, status, deleted_at) values
  ('${inv.draft}', '${ORG}', '${wcl}', '${driverRow}', '2026-09-07', '2026-09-13', 'draft', null),
  ('${inv.issued}', '${ORG}', '${wcl}', '${driverRow}', '2026-09-14', '2026-09-20', 'issued', null),
  ('${inv.paid}', '${ORG}', '${wcl}', '${driverRow}', '2026-09-21', '2026-09-27', 'paid', null),
  ('${inv.void}', '${ORG}', '${wcl}', '${driverRow}', '2026-09-28', '2026-10-04', 'void', null),
  ('${inv.deletedDraft}', '${ORG}', '${wcl}', '${driverRow}', '2026-10-05', '2026-10-11', 'draft', now()),
  ('${inv.companyDraft}', '${ORG}', '${client}', null, '2026-10-12', '2026-10-18', 'draft', null)
on conflict (id) do nothing;
`);

const setAs = (user, company) =>
  psqlAs("authenticated", user, `select public.set_org_invoice_bill_to('${ORG}'::uuid, '${company}'::uuid)::text;`, { allowError: true });
const companyOf = (id) => psqlAdmin(`select company_id::text from public.invoices where id = '${id}'`);
const setting = () => psqlAdmin(`select coalesce(settings->>'invoice_bill_to_company_id', '') from public.organisations where id = '${ORG}'`);

// Fallback read before any explicit setting.
const before = psqlAs("authenticated", manager, `select company_id::text || '|' || is_explicit::text from public.get_org_invoice_bill_to('${ORG}');`);
check("get: member sees WCL fallback (not explicit)", before.out === `${wcl}|false`, before.out);
const foreign = psqlAs("authenticated", outsider, `select count(*)::text from public.get_org_invoice_bill_to('${ORG}');`);
check("get: non-member sees nothing", foreign.out === "0", foreign.out);

const m = setAs(manager, newBill);
check("manager denied", !m.ok && /Only organisation admins/.test(m.text), m.text);
const o = setAs(outsider, newBill);
check("other-org admin denied", !o.ok && /Only organisation admins/.test(o.text), o.text);
const x = setAs(admin, otherOrgCo);
check("other-org company rejected", !x.ok && /active company in this organisation/.test(x.text), x.text);
const i = setAs(admin, inactive);
check("inactive company rejected", !i.ok && /active company in this organisation/.test(i.text), i.text);
check("setting untouched after rejects", setting() === "", setting());

const ok = setAs(admin, newBill);
check("admin set returns 1 draft retargeted", ok.ok && ok.out === "1", ok.text);
check("setting written", setting() === newBill, setting());
check("draft driver-week invoice retargeted", companyOf(inv.draft) === newBill);
for (const k of ["issued", "paid", "void", "deletedDraft"]) check(`${k} invoice untouched`, companyOf(inv[k]) === wcl, companyOf(inv[k]));
check("company-level draft untouched", companyOf(inv.companyDraft) === client);
const audit = psqlAdmin(`select count(*)::text from public.audit_logs where organisation_id = '${ORG}' and action = 'organisation.invoice_bill_to.set' and actor_id = '${admin}'`);
check("audit row written with actor", audit === "1", audit);
const after = psqlAs("authenticated", admin, `select company_name || '|' || is_explicit::text from public.get_org_invoice_bill_to('${ORG}');`);
check("get: explicit new bill-to", after.out === "New Bill-To|true", after.out);
const again = setAs(admin, newBill);
check("idempotent re-set retargets 0", again.ok && again.out === "0", again.text);

const anon = psqlAs("anon", null, `select public.set_org_invoice_bill_to('${ORG}'::uuid, '${wcl}'::uuid);`, { allowError: true });
check("anon cannot set (revoked or unauthenticated)", !anon.ok, anon.text);
const overloads = psqlAdmin(`select count(*)::text from pg_proc where proname in ('set_org_invoice_bill_to','get_org_invoice_bill_to') and pronamespace = 'public'::regnamespace`);
check("no overloads", overloads === "2", overloads);
const acl = psqlAdmin(`select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'execute')::text, ',' order by p.proname) from pg_proc p where proname in ('set_org_invoice_bill_to','get_org_invoice_bill_to') and pronamespace = 'public'::regnamespace`);
check("anon has no execute (db)", acl === "get_org_invoice_bill_to:false,set_org_invoice_bill_to:false", acl);

process.exit(failed);
