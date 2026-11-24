import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00083_workshop_bill_final_lock.sql");
const code = sql.replace(/--[^\n]*/g, "");
const rollback = read("supabase/rollback-00083.sql");

describe("migration 00083 workshop bill final lock", () => {
  it("adds before update-or-delete row triggers on bills and lines", () => {
    expect(code).toMatch(/create trigger workshop_bills_final_lock\s+before update or delete on public\.workshop_bills\s+for each row/);
    expect(code).toMatch(/create trigger workshop_bill_lines_final_lock\s+before update or delete on public\.workshop_bill_lines\s+for each row/);
  });

  it("raises bill_approved_locked only when OLD status is approved (approve transition passes)", () => {
    expect(code).toMatch(/if old\.status = 'approved' then\s+raise exception 'bill_approved_locked'/);
    expect(code).not.toMatch(/new\.status/);
  });

  it("looks up the parent bill for lines and serialises with approve", () => {
    expect(code).toMatch(/from public\.workshop_bills b\s+where b\.id = old\.bill_id\s+for share/);
  });

  it("pins search_path, revokes execute, adds no enum value or reopen", () => {
    expect((code.match(/set search_path = pg_catalog, public/g) ?? []).length).toBe(2);
    expect(code).toMatch(/revoke all on function public\.guard_workshop_bill_final\(\)/);
    expect(code).toMatch(/revoke all on function public\.guard_workshop_bill_line_final\(\)/);
    expect(code).not.toMatch(/alter type|reopen|create or replace function public\.(approve|delete)_workshop_bill/i);
  });

  it("has a rollback that drops both triggers and functions", () => {
    expect(rollback).toMatch(/drop trigger if exists workshop_bill_lines_final_lock/);
    expect(rollback).toMatch(/drop trigger if exists workshop_bills_final_lock/);
    expect(rollback).toMatch(/drop function if exists public\.guard_workshop_bill_line_final\(\)/);
    expect(rollback).toMatch(/drop function if exists public\.guard_workshop_bill_final\(\)/);
  });

  it("is the highest migration number and unique", () => {
    const nums = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.startsWith("00083"));
    expect(nums).toEqual(["00083_workshop_bill_final_lock.sql"]);
  });
});
