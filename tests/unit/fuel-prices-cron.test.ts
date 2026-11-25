import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({ rpc })),
}));

import { createServiceClient } from "@/lib/supabase/admin";
import { GET, POST } from "@/app/api/cron/fuel-prices/route";
import { isPublicBearerApiPath } from "@/lib/auth/cron-public-paths";

const DEMO = readFileSync(path.resolve(__dirname, "../fixtures/dmpr/demo-release.html"), "utf8");
const req = (auth?: string) =>
  new Request("http://localhost/api/cron/fuel-prices", {
    headers: auth ? { authorization: auth } : {},
  });

const envBackup = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === "ingest_global_fuel_prices" ? { data: 8, error: null } : { data: 3, error: null }
  );
  process.env.CRON_SECRET = "cron-secret-value";
  fetchMock = vi.fn(async () => new Response(DEMO, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  process.env = { ...envBackup };
  vi.unstubAllGlobals();
});

const called = (name: string) => rpc.mock.calls.filter(([n]) => n === name);

describe("/api/cron/fuel-prices", () => {
  it("is a bearer cron path (no session in middleware)", () => {
    expect(isPublicBearerApiPath("/api/cron/fuel-prices")).toBe(true);
  });

  it("rejects missing / wrong bearer and touches nothing", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req("Bearer nope"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("503 without a service client", async () => {
    vi.mocked(createServiceClient).mockReturnValueOnce(null);
    expect((await GET(req("Bearer cron-secret-value"))).status).toBe(503);
  });

  it("inserts global PENDING rows via ingest with source dmpr_official", async () => {
    const res = await GET(req("Bearer cron-secret-value"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, inserted: 8, parsed: 8, effective_from: "2099-01-07" });
    const [[, args]] = called("ingest_global_fuel_prices");
    expect(args.p_source).toBe("dmpr_official");
    expect(args.p_rows).toHaveLength(8);
    expect(called("notify_fuel_price_ingest_failure")).toHaveLength(0);
  });

  it("is idempotent: a re-run that inserts 0 is still ok and does not notify", async () => {
    rpc.mockImplementation(async () => ({ data: 0, error: null }));
    const res = await GET(req("Bearer cron-secret-value"));
    expect(await res.json()).toMatchObject({ ok: true, inserted: 0 });
    expect(called("notify_fuel_price_ingest_failure")).toHaveLength(0);
  });

  it.each([
    ["network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["HTTP 500", async () => new Response("down", { status: 500 })],
    ["unparseable page", async () => new Response("<html><body>No prices here today</body></html>", { status: 200 })],
    ["partial table", async () => new Response(DEMO.replace(/<tr><td>Diesel 0\.005%[\s\S]*?<\/tr>/, ""), { status: 200 })],
  ])("on %s: inserts nothing and notifies finance", async (_label, impl) => {
    fetchMock.mockImplementation(impl);
    const res = await GET(req("Bearer cron-secret-value"));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await res.json()).toMatchObject({ ok: false, inserted: 0, notified: 3 });
    expect(called("ingest_global_fuel_prices")).toHaveLength(0);
    expect(called("notify_fuel_price_ingest_failure")).toHaveLength(1);
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["notify_fuel_price_ingest_failure"]);
  });

  it("on ingest error: notifies (the RPC is one transaction, so nothing was saved)", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "ingest_global_fuel_prices"
        ? { data: null, error: { message: "boom" } }
        : { data: 2, error: null }
    );
    const res = await GET(req("Bearer cron-secret-value"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, notified: 2 });
  });

  it("route never confirms or writes org rows", () => {
    const src = readFileSync(path.resolve(__dirname, "../../app/api/cron/fuel-prices/route.ts"), "utf8");
    expect(src).not.toMatch(/confirm_fuel_prices|upsert_org_fuel_price|\.from\(/);
    expect(src).not.toMatch(/DEMO/);
  });
});
