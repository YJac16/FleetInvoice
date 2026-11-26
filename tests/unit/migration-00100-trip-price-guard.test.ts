import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const sql = read("supabase/migrations/00100_trip_price_guard.sql");
const rollback = read("supabase/rollback-00100.sql");

describe("migration 00100 trip price guard", () => {
  it("creates an invoker trigger function guarding the billed-price columns", () => {
    expect(sql).toMatch(
      /create or replace function public\.trips_reject_direct_billing_price\(\)/
    );
    expect(sql).not.toMatch(/^security definer/im);
    expect(sql).toMatch(/current_user in \('authenticated', 'anon', 'authenticator'\)/);
    for (const col of ["manual_unit_price", "manual_price_area_key", "reprice_on_next_sync"]) {
      expect(sql).toContain(`new.${col}`);
    }
    expect(sql).toMatch(/tg_op = 'INSERT'/);
    expect(sql).toMatch(/Trip price columns can only be changed by staff billing actions/);
  });

  it("installs a before insert or update trigger, idempotently", () => {
    expect(sql).toMatch(
      /drop trigger if exists trips_reject_direct_billing_price on public\.trips/
    );
    expect(sql).toMatch(
      /create trigger trips_reject_direct_billing_price\s+before insert or update on public\.trips/
    );
    expect(sql).toMatch(
      /revoke all on function public\.trips_reject_direct_billing_price\(\) from public, anon, authenticated/
    );
  });

  it("makes the invoice-line sync internal", () => {
    expect(sql).toMatch(
      /revoke all on function public\.sync_staff_trip_invoice_line\(uuid, boolean\) from public, anon, authenticated/
    );
    expect(sql).toMatch(
      /grant execute on function public\.sync_staff_trip_invoice_line\(uuid, boolean\) to service_role/
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.sync_staff_trip_invoice_line\(uuid, boolean\) to authenticated/
    );
  });

  it("does not touch pricing logic or data", () => {
    expect(sql).not.toMatch(/create or replace function public\.sync_staff_trip_invoice_line/);
    expect(sql).not.toMatch(/\b(insert into|update|delete from)\s+public\./i);
  });

  it("has a manual rollback restoring the 00097 grant", () => {
    expect(existsSync(path.join(root, "supabase/rollback-00100.sql"))).toBe(true);
    expect(rollback).toMatch(/^begin;/m);
    expect(rollback).toMatch(/^commit;/m);
    expect(rollback).toMatch(
      /drop trigger if exists trips_reject_direct_billing_price on public\.trips/
    );
    expect(rollback).toMatch(
      /drop function if exists public\.trips_reject_direct_billing_price\(\)/
    );
    expect(rollback).toMatch(
      /grant execute on function public\.sync_staff_trip_invoice_line\(uuid, boolean\) to authenticated/
    );
  });

  it("leaves reserved migration numbers unused", () => {
    for (const n of ["00071", "00072", "00096"]) {
      const out = execFileSync("git", ["ls-files", `supabase/migrations/${n}_*`], {
        cwd: root,
        encoding: "utf8",
      });
      expect(out.trim()).toBe("");
    }
  });
});

describe("app code does not call the internal invoice sync", () => {
  it('has no .rpc("sync_staff_trip_invoice_line" in client code', () => {
    const res = spawnSync(
      "git",
      [
        "grep",
        "-n",
        "-E",
        "rpc\\(\\s*[\"'`]sync_staff_trip_invoice_line",
        "--",
        "app",
        "lib",
        "services",
        "features",
        "components",
        "hooks",
      ],
      { cwd: root, encoding: "utf8" }
    );
    // git grep exits 1 when nothing matches
    expect(res.status).toBe(1);
    expect(res.stdout).toBe("");
  });
});
