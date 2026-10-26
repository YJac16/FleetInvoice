#!/usr/bin/env node
/**
 * 00069 — invoice numbers + VAT trigger.
 * Requires a bootstrapped local DB (scripts/local-db/bootstrap-native.sh).
 */
import { spawnSync } from "node:child_process";

const DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";
const ORG = "a0000000-0000-4000-8000-000000000001";
const PERIOD = "2031-01-06";

const results = [];
function record(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${detail}`);
}

function sql(text, { allowError = false } = {}) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", DB, "-v", "ON_ERROR_STOP=1", "-tA", "-F", "|", "-c", text],
    { encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) throw new Error(res.stderr || res.stdout);
  return { ok: res.status === 0, out: (res.stdout ?? "").trim(), err: res.stderr ?? "" };
}

function invoiceRow() {
  const [number, seq, subtotal, rate, vat, total, status] = sql(
    `select coalesce(invoice_number,''), coalesce(invoice_seq::text,''), subtotal, vat_rate, vat_amount, total, status
     from public.invoices where organisation_id = '${ORG}' and period_start = '${PERIOD}';`
  ).out.split("|");
  return { number, seq, subtotal: Number(subtotal), rate: Number(rate), vat: Number(vat), total: Number(total), status };
}

// Clean slate for this test's invoice + VAT settings on.
sql(`delete from public.invoice_lines where invoice_id in (select id from public.invoices where organisation_id = '${ORG}' and period_start = '${PERIOD}');`);
sql(`delete from public.invoices where organisation_id = '${ORG}' and period_start = '${PERIOD}';`);
sql(`update public.organisations
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{invoice}',
       coalesce(settings->'invoice', '{}'::jsonb) || '{"vat_registered":true,"vat_rate":15,"number_prefix":"t-x"}'::jsonb)
     where id = '${ORG}';`);

const company = sql(`select id from public.companies where organisation_id = '${ORG}' and deleted_at is null limit 1;`).out;
sql(`insert into public.invoices (organisation_id, company_id, period_start, period_end, subtotal, total)
     values ('${ORG}', '${company}', '${PERIOD}', '2031-01-12', 0, 0);`);

sql(`update public.invoices set subtotal = 1000, total = 1000 where organisation_id = '${ORG}' and period_start = '${PERIOD}';`);
let row = invoiceRow();
record("draft-vat", row.rate === 15 && row.vat === 150 && row.total === 1150, JSON.stringify(row));
record("draft-no-number", row.number === "" && row.seq === "", `number='${row.number}'`);

const before = Number(sql(`select coalesce(max(invoice_seq), 0) from public.invoices where organisation_id = '${ORG}';`).out);
sql(`update public.invoices set status = 'issued', issued_at = now() where organisation_id = '${ORG}' and period_start = '${PERIOD}';`);
row = invoiceRow();
const expected = `TX-${String(before + 1).padStart(5, "0")}`;
record("issue-assigns-next-number", row.number === expected && Number(row.seq) === before + 1, `${row.number} expected ${expected}`);

sql(`update public.organisations set settings = jsonb_set(settings, '{invoice,vat_rate}', '20') where id = '${ORG}';`);
sql(`update public.invoices set status = 'paid', invoice_number = 'HACKED', invoice_seq = 9999
     where organisation_id = '${ORG}' and period_start = '${PERIOD}';`);
row = invoiceRow();
record("number-immutable", row.number === expected, `number=${row.number}`);
record("rate-frozen-after-issue", row.rate === 15 && row.total === 1150, JSON.stringify(row));

const counterDenied = sql(
  `begin; set local role authenticated; select count(*) from public.invoice_number_counters; commit;`,
  { allowError: true }
);
record("counter-table-not-readable-by-clients", !counterDenied.ok, counterDenied.err.split("\n")[0] ?? "");

const failed = results.filter((r) => !r.pass);
console.log(`\n00069 invoice VAT/number tests: ${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
