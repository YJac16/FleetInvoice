import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "supabase/migrations");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00080_mask_trip_prices_in_rpc_returns.sql");
const rollback = read("supabase/rollback-00080.sql");

/** SECURITY DEFINER RPCs executable by authenticated that return a full trips row. */
const MASKED: Record<string, string> = {
  transition_trip: "uuid, public.trip_event_type, text, jsonb",
  cancel_staff_trip: "uuid",
  start_staff_trip: "uuid, numeric, boolean",
  end_staff_trip: "uuid, numeric",
  advance_staff_trip_en_route: "uuid",
  update_staff_trip:
    "uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, numeric, boolean",
  approve_driver_trip: "uuid, uuid, numeric, boolean",
  reject_driver_trip: "uuid, text",
};
/** Return trips rows but are not executable by authenticated (internal helpers). */
const INTERNAL = ["set_staff_trip_status", "assert_staff_trip_driver"];

const MASK_RE =
  /\n {2}-- 00080: mask billed price columns for callers who cannot manage trips\n {2}if not public\.staff_can_manage_trips\(t\.organisation_id\) then\n {4}t\.manual_unit_price := null;\n {4}t\.manual_price_area_key := null;\n {2}end if;\n/;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every `create [or replace] function public.<name>(...) ... $$;` in text, in order. */
function functionDefs(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`create (?:or replace )?function public\\.${esc(name)}\\s*\\(`, "gi");
  for (const m of text.matchAll(re)) {
    const start = m.index!;
    const bodyStart = text.indexOf("$$", start);
    const bodyEnd = text.indexOf("$$;", bodyStart + 2);
    out.push(text.slice(start, bodyEnd + 3));
  }
  return out;
}

const earlierFiles = readdirSync(dir)
  .filter((f) => /^\d{5}_.*\.sql$/.test(f) && f < "00080")
  .sort();

/** Latest definition of a function across migrations before 00080. */
function latestDef(name: string): string {
  let def: string | undefined;
  for (const f of earlierFiles) {
    const defs = functionDefs(readFileSync(path.join(dir, f), "utf8"), name);
    if (defs.length) def = defs.at(-1);
  }
  if (!def) throw new Error(`no definition of ${name}`);
  return def;
}

const header = (def: string) => def.slice(0, def.indexOf("$$"));

/** These returned `public.set_staff_trip_status(...)` directly before 00080. */
const RETURNED_STATUS_CALL = ["start_staff_trip", "end_staff_trip", "advance_staff_trip_en_route"];

/** Undo the 00080 edit: drop the mask, turn `t := set_staff_trip_status(...)` back into a return. */
function unmask(name: string, def: string): string {
  let s = def.replace(MASK_RE, "\n");
  if (RETURNED_STATUS_CALL.includes(name)) {
    s = s
      .replace(/\n {2}t := public\.set_staff_trip_status\(/, "\n  return public.set_staff_trip_status(")
      .replace(/\n {2}return t;\n/, "\n");
  }
  return s;
}

describe("migration 00080 masks trip prices in RPC returns", () => {
  it("is wrapped in a transaction", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });

  for (const [name, args] of Object.entries(MASKED)) {
    describe(name, () => {
      const defs = functionDefs(sql, name);
      const def = defs[0] ?? "";

      it("is recreated exactly once with CREATE OR REPLACE", () => {
        expect(defs).toHaveLength(1);
        expect(def).toMatch(new RegExp(`^create or replace function public\\.${name}\\(`));
        expect(sql).not.toMatch(new RegExp(`drop function[^;]*public\\.${name}\\b`, "i"));
      });

      it("keeps signature, return type, security definer and search_path", () => {
        expect(header(def)).toBe(header(latestDef(name)));
        expect(header(def)).toMatch(/returns public\.trips/);
        expect(header(def)).toMatch(/security definer/);
      });

      it("nulls manual_unit_price and manual_price_area_key for non-staff right before its only RETURN", () => {
        const returns = def.match(/\breturn\b/gi) ?? [];
        expect(returns).toHaveLength(1);
        expect(def).not.toMatch(/return public\.set_staff_trip_status/);
        const tail = def.slice(def.search(MASK_RE));
        expect(tail).toMatch(MASK_RE);
        expect(tail.replace(MASK_RE, "\n")).toMatch(/^\n {2}return t;\nend;\n\$\$;$/);
      });

      it("changes nothing else in the body", () => {
        expect(unmask(name, def)).toBe(latestDef(name));
      });

      it("keeps EXECUTE for authenticated only (no anon / public)", () => {
        const sig = esc(`public.${name}(${args})`);
        expect(sql).toMatch(new RegExp(`revoke all on function ${sig} from public, anon;`));
        expect(sql).toMatch(new RegExp(`grant execute on function ${sig} to authenticated;`));
        expect(sql).not.toMatch(new RegExp(`grant [^;]*${esc(`public.${name}(`)}[^;]*to [^;]*anon`));
      });

      it("rollback restores the latest pre-00080 definition verbatim", () => {
        const rb = functionDefs(rollback, name);
        expect(rb).toHaveLength(1);
        expect(rb[0]).toBe(latestDef(name));
        expect(rb[0]).not.toMatch(/00080/);
        const sig = esc(`public.${name}(${args})`);
        expect(rollback).toMatch(new RegExp(`grant execute on function ${sig} to authenticated;`));
      });
    });
  }

  it("does not touch the internal helpers", () => {
    for (const name of INTERNAL) {
      expect(functionDefs(sql, name)).toHaveLength(0);
      expect(sql).not.toMatch(new RegExp(`(grant|revoke)[^;]*public\\.${name}\\(`));
    }
  });

  it("covers every function whose latest definition returns a trips row", () => {
    const names = new Set<string>();
    for (const f of earlierFiles) {
      const text = readFileSync(path.join(dir, f), "utf8");
      for (const m of text.matchAll(/create (?:or replace )?function public\.(\w+)\s*\(/gi)) {
        names.add(m[1]);
      }
    }
    const returningTrips = [...names].filter((n) =>
      /returns\s+(setof\s+)?(table\s*\([^)]*)?public\.trips\b/i.test(header(latestDef(n)))
    );
    expect(returningTrips.sort()).toEqual([...Object.keys(MASKED), ...INTERNAL].sort());
  });
});
