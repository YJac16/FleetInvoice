/**
 * Step 4 (GoOps refocus) — module guards on API routes
 * (lib/auth/module-guard.ts guardModuleApi): POST /api/invoices/send
 * (billing) and POST /api/gps/ingest (gps). Denied -> 403 JSON before any
 * data is read or written.
 * Run: npm run test:module-guards
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_FULL = "a0000000-0000-4000-8000-000000000001"; // billing + gps plan
const ORG_CORE = "b0000000-0000-4000-8000-000000000001"; // core-only plan
const ORG_NONE = "c0000000-0000-4000-8000-000000000001"; // no subscription -> fail-open

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function seed() {
  tables.profiles = [
    { id: "u-owner", is_platform_owner: true },
    { id: "u-full", is_platform_owner: false },
    { id: "u-core", is_platform_owner: false },
    { id: "u-none", is_platform_owner: false },
  ];
  tables.organisation_members = [
    { organisation_id: ORG_FULL, user_id: "u-full", role: "organisation_admin", status: "active" },
    { organisation_id: ORG_CORE, user_id: "u-core", role: "organisation_admin", status: "active" },
    { organisation_id: ORG_NONE, user_id: "u-none", role: "organisation_admin", status: "active" },
  ];
  tables.subscriptions = [
    { organisation_id: ORG_FULL, plan_id: "p-full", status: "active" },
    { organisation_id: ORG_CORE, plan_id: "p-core", status: "active" },
  ];
  tables.module_entitlements = [
    { plan_id: "p-full", module_key: "core" },
    { plan_id: "p-full", module_key: "billing" },
    { plan_id: "p-full", module_key: "gps" },
    { plan_id: "p-core", module_key: "core" },
  ];
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const run = () => ({
    data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))),
    error: null,
  });
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

/** Fake user-scoped client: records data access so tests can assert none happened. */
const userFrom = vi.fn(() => {
  const b: Record<string, unknown> = {};
  for (const k of ["select", "eq", "is"]) b[k] = () => b;
  b.maybeSingle = async () => ({ data: null, error: null }); // -> "Invoice not found"
  return b;
});
const userRpc = vi.fn(async () => ({ data: 2, error: null }));
let sessionUser: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: sessionUser ? { id: sessionUser } : null } })) },
    from: userFrom,
    rpc: userRpc,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({ from: (t: string) => query(t) })),
}));
vi.mock("@/lib/env", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isEmailDeliveryConfigured: () => true,
}));
vi.mock("@/lib/notifications/resend-server", () => ({ sendResendEmail: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  sessionUser = null;
});

function post(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendInvoice(organisationId: string) {
  const { POST } = await import("@/app/api/invoices/send/route");
  return POST(
    post({
      organisationId,
      invoiceId: "f0000000-0000-4000-8000-000000000001",
      to: "billing@example.com",
      printUrl: "http://localhost/invoices/x/print",
    })
  );
}

async function ingest(organisationId: string) {
  const { POST } = await import("@/app/api/gps/ingest/route");
  return POST(post({ organisationId, points: [{ lat: -26.2, lng: 28.0 }] }));
}

describe("POST /api/invoices/send (billing)", () => {
  it("403 module_not_entitled for a core-only org, without looking up the invoice", async () => {
    sessionUser = "u-core";
    const res = await sendInvoice(ORG_CORE);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "module_not_entitled" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(userFrom).not.toHaveBeenCalled();
  });

  it("403 forbidden for a non-member", async () => {
    sessionUser = "u-core";
    const res = await sendInvoice(ORG_FULL);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(userFrom).not.toHaveBeenCalled();
  });

  it("401 without a session (unchanged)", async () => {
    const res = await sendInvoice(ORG_FULL);
    expect(res.status).toBe(401);
  });

  it.each([
    ["entitled member", "u-full", ORG_FULL],
    ["member under fail-open", "u-none", ORG_NONE],
    ["platform owner on a core-only org", "u-owner", ORG_CORE],
  ])("%s passes the guard and reaches the invoice lookup", async (_label, user, org) => {
    sessionUser = user;
    const res = await sendInvoice(org);
    expect(res.status).toBe(404); // fake lookup returns no invoice
    expect(userFrom).toHaveBeenCalledWith("invoices");
  });
});

describe("POST /api/gps/ingest (gps)", () => {
  it("403 module_not_entitled for a core-only org, without calling the RPC", async () => {
    sessionUser = "u-core";
    const res = await ingest(ORG_CORE);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "module_not_entitled" });
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("403 forbidden for a non-member", async () => {
    sessionUser = "u-core";
    const res = await ingest(ORG_FULL);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("401 without a session (unchanged)", async () => {
    const res = await ingest(ORG_FULL);
    expect(res.status).toBe(401);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["entitled member", "u-full", ORG_FULL],
    ["member under fail-open", "u-none", ORG_NONE],
    ["platform owner on a core-only org", "u-owner", ORG_CORE],
  ])("%s passes the guard and ingests", async (_label, user, org) => {
    sessionUser = user;
    const res = await ingest(org);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 2 });
    expect(userRpc).toHaveBeenCalledWith("ingest_gps_points", expect.objectContaining({ p_organisation_id: org }));
  });
});
