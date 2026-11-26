import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
let rows: unknown[] = [];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: (s: string) => {
        select(s);
        const chain = {
          eq: () => chain,
          then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
            resolve({ data: rows, error: null }),
        };
        return chain;
      },
    }),
  }),
}));

import { listInvoiceLinesWithTrips } from "@/services/invoices.service";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const code = (t: string) => t.replace(/--[^\n]*/g, "");

const trip = (id: string, plannedStart: string) => ({
  id,
  planned_start: plannedStart,
  notes: null,
});

const line = (id: string, extra: Record<string, unknown>) => ({
  id,
  organisation_id: "org",
  invoice_id: "inv",
  line_type: "trip",
  fuel_fillup_id: null,
  rate_card_id: null,
  trip_id: null,
  voided_trip_id: null,
  trip_company_id: null,
  rate_effective_on: null,
  description: "",
  quantity: 1,
  unit_price: 100,
  amount: 100,
  created_at: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("00097 print: voided trips", () => {
  beforeEach(() => {
    select.mockClear();
  });

  it("embeds voided_trips by voided_trip_id and falls back to it", async () => {
    rows = [
      line("a", { trip_id: "t1", trips: trip("t1", "2026-10-06T06:00:00Z"), voided_trips: null }),
      line("b", { voided_trip_id: "t2", trips: null, voided_trips: trip("t2", "2026-10-05T06:00:00Z") }),
    ];
    const out = await listInvoiceLinesWithTrips("org", "inv");
    expect(select.mock.calls[0][0]).toMatch(/trips:trip_id \(/);
    expect(select.mock.calls[0][0]).toMatch(/voided_trips:voided_trip_id \(/);
    expect(out.map((l) => l.trips?.id)).toEqual(["t2", "t1"]);
    expect(out.every((l) => !("voided_trips" in l))).toBe(true);
  });
});

describe("00097 migration / rollback", () => {
  const m = code(read("supabase/migrations/00097_void_release_trip_ids.sql"));
  const rb = code(read("supabase/rollback-00097.sql"));

  it("adds a non-unique voided_trip_id FK and keeps the trip_id unique index", () => {
    expect(m).toMatch(/add column if not exists voided_trip_id uuid\s+references public\.trips \(id\)/);
    expect(m).not.toMatch(/unique[^;]*voided_trip_id/i);
    expect(m).not.toMatch(/invoice_lines_trip_id_uidx/);
  });

  it("releases trip_ids before update when status turns void", () => {
    expect(m).toMatch(/before update of status on public\.invoices/);
    expect(m).toMatch(/when \(new\.status = 'void' and old\.status is distinct from 'void'\)/);
    expect(m).toMatch(/voided_trip_id = coalesce\(il\.voided_trip_id, il\.trip_id\),\s+trip_id = null/);
  });

  it("sync week lookup skips void invoices; otherwise matches 00070", () => {
    const fn = (s: string) => {
      const a = s.indexOf("create or replace function public.sync_staff_trip_invoice_line(");
      return s.slice(a, s.indexOf("$$;", a) + 3);
    };
    const f70 = fn(read("supabase/migrations/00070_route_price_templates.sql"));
    const f97 = fn(read("supabase/migrations/00097_void_release_trip_ids.sql"));
    expect(f97).toContain("and i.status <> 'void'\n  limit 1;");
    expect(f97.replace("    and i.status <> 'void'\n", "")).toBe(f70);
    expect(fn(read("supabase/rollback-00097.sql"))).toBe(f70);
  });

  it("rollback restores trip_id only without unique conflict and drops the column", () => {
    expect(rb).toMatch(/not exists \(\s*select 1 from public\.invoice_lines other\s+where other\.trip_id = il\.voided_trip_id/);
    expect(rb).toMatch(/distinct on \(il\.voided_trip_id\)/);
    expect(rb).toMatch(/drop trigger if exists invoices_release_trip_ids_on_void/);
    expect(rb).toMatch(/drop column if exists voided_trip_id/);
  });
});
