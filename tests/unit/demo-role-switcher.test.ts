import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
const signOut = vi.fn();
const verifyOtp = vi.fn();
const generateLink = vi.fn();
const rpc = vi.fn();

type Row = Record<string, unknown>;
const GROWTH = ["core", "gps", "attendance", "billing", "payroll", "reports", "maintenance"];
const SCALE_WITH_HUBS = [...GROWTH, "passengers", "portal"];
let planModules: string[] = SCALE_WITH_HUBS;
function tables(): Record<string, Row[]> {
  return {
    organisations: [{ id: "org-demo", slug: "cape-shuttle-ops" }],
    subscriptions: [{ organisation_id: "org-demo", plan_id: "p-demo", status: "active" }],
    module_entitlements: planModules.map((module_key) => ({ plan_id: "p-demo", module_key })),
  };
}
function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const run = () => ({
    data: (tables()[table] ?? []).filter((r) => filters.every((f) => f(r))),
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

const createClient = vi.fn(async () => ({
  auth: { getUser, signOut, verifyOtp },
  from: (t: string) => query(t),
  rpc,
}));
const createServiceClient = vi.fn(() => ({
  auth: { admin: { generateLink } },
  from: (t: string) => query(t),
}));
const cookieSet = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet, get: () => undefined, getAll: () => [] }),
}));

const DEMO_URL = "https://afeeqbcwwpquqjeowksa.supabase.co";
const LIVE_URL = "https://abcdefghijklmnopqrst.supabase.co";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/demo/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setEnv(mode: string | undefined, url: string | undefined) {
  if (mode === undefined) vi.stubEnv("DEMO_MODE", undefined as unknown as string);
  else vi.stubEnv("DEMO_MODE", mode);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url as string);
}

describe("isDemoEnabled", () => {
  it("is true only for DEMO_MODE=true and the demo ref", async () => {
    const { isDemoEnabled } = await import("@/lib/demo/guard");
    expect(
      isDemoEnabled({ DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: DEMO_URL })
    ).toBe(true);
  });

  it.each([
    ["other ref", { DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: LIVE_URL }],
    ["lookalike host", { DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: "https://afeeqbcwwpquqjeowksa.supabase.co.evil.com" }],
    ["subdomain prefix", { DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: "https://x.afeeqbcwwpquqjeowksa.supabase.co" }],
    ["missing url", { DEMO_MODE: "true" }],
    ["missing flag", { NEXT_PUBLIC_SUPABASE_URL: DEMO_URL }],
    ["flag false", { DEMO_MODE: "false", NEXT_PUBLIC_SUPABASE_URL: DEMO_URL }],
    ["flag TRUE", { DEMO_MODE: "TRUE", NEXT_PUBLIC_SUPABASE_URL: DEMO_URL }],
    ["flag 1", { DEMO_MODE: "1", NEXT_PUBLIC_SUPABASE_URL: DEMO_URL }],
    ["flag empty", { DEMO_MODE: "", NEXT_PUBLIC_SUPABASE_URL: DEMO_URL }],
  ])("is false for %s", async (_name, source) => {
    const { isDemoEnabled } = await import("@/lib/demo/guard");
    expect(isDemoEnabled(source as Record<string, string | undefined>)).toBe(false);
  });
});

describe("POST /api/demo/switch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    const { resetDemoRateLimit } = await import("@/lib/demo/rate-limit");
    resetDemoRateLimit();
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hash" } },
      error: null,
    });
    verifyOtp.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    planModules = SCALE_WITH_HUBS;
  });

  it.each([
    ["employee", "passengers"],
    ["company_manager", "portal"],
  ])("refuses %s with 400 role_not_on_plan on Growth (no %s)", async (role) => {
    setEnv("true", DEMO_URL);
    planModules = GROWTH;
    getUser.mockResolvedValue({
      data: { user: { id: "u-growth", email: "demo-admin@example.com" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "role_not_on_plan" });
    expect(generateLink).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("still switches to ops roles on Growth", async () => {
    setEnv("true", DEMO_URL);
    planModules = GROWTH;
    getUser.mockResolvedValue({
      data: { user: { id: "u-growth-ops", email: "demo-admin@example.com" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "dispatcher" }));
    expect(res.status).toBe(200);
  });

  it("refuses employee when the org has no plan (fail-open excludes passengers)", async () => {
    setEnv("true", DEMO_URL);
    planModules = [];
    getUser.mockResolvedValue({
      data: { user: { id: "u-noplan", email: "demo-admin@example.com" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "employee" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when DEMO_MODE is missing", async () => {
    setEnv(undefined, DEMO_URL);
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "driver" }));
    expect(res.status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("returns 404 on a non-demo project even with DEMO_MODE=true", async () => {
    setEnv("true", LIVE_URL);
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "driver" }));
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-demo caller", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "real.person@company.co.za" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "driver" }));
    expect(res.status).toBe(403);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("returns 401 when not signed in", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "driver" }));
    expect(res.status).toBe(401);
  });

  it.each([["platform_owner"], ["nope"], [null], [42]])(
    "returns 403 for target %s not on the list",
    async (role) => {
      setEnv("true", DEMO_URL);
      getUser.mockResolvedValue({
        data: { user: { id: "u1", email: "demo-admin@example.com" } },
      });
      const { POST } = await import("@/app/api/demo/switch/route");
      const res = await POST(req({ role }));
      expect(res.status).toBe(403);
      expect(generateLink).not.toHaveBeenCalled();
    }
  );

  it("swaps to the mapped account and returns the role hub", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "demo-admin@example.com" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "company_manager" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ redirectTo: "/company" });
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "demo-client@example.com",
    });
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "hash" });
    expect(cookieSet).toHaveBeenCalledWith(
      "workops_organisation_id",
      "org-demo",
      expect.any(Object)
    );
  });

  it("rate limits repeated switches", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u-rl", email: "demo-admin@example.com" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await POST(req({ role: "driver" }))).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe("DemoRoleSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("renders nothing when the guard is off", async () => {
    setEnv(undefined, DEMO_URL);
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    expect(await DemoRoleSwitcher()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("renders nothing on a non-demo ref", async () => {
    setEnv("true", LIVE_URL);
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    expect(await DemoRoleSwitcher()).toBeNull();
  });

  it("renders nothing for a non-demo user", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "real.person@company.co.za" } },
    });
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    expect(await DemoRoleSwitcher()).toBeNull();
  });

  it("renders the panel for a demo user when on", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "demo-driver@example.com" } },
    });
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    expect(await DemoRoleSwitcher()).not.toBeNull();
  });

  it("passes the signed-in role and the demo org's modules", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "Demo-Dispatcher@example.com" } },
    });
    rpc.mockResolvedValue({ data: GROWTH, error: null });
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    const el = (await DemoRoleSwitcher()) as { props: Record<string, unknown> };
    expect(el.props.currentRole).toBe("dispatcher");
    expect(el.props.entitledModules).toEqual(GROWTH);
    expect(rpc).toHaveBeenCalledWith("org_entitled_modules", { p_organisation_id: "org-demo" });
  });

  it("falls back to FAIL_OPEN_MODULES when the RPC fails", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "demo-admin@example.com" } },
    });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { FAIL_OPEN_MODULES } = await import("@/lib/entitlements");
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    const el = (await DemoRoleSwitcher()) as { props: Record<string, unknown> };
    expect(el.props.currentRole).toBe("organisation_admin");
    expect(el.props.entitledModules).toEqual(FAIL_OPEN_MODULES);
  });
});

describe("demo@goops.co.za switcher allowlist", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    const { resetDemoRateLimit } = await import("@/lib/demo/rate-limit");
    resetDemoRateLimit();
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hash" } },
      error: null,
    });
    verifyOtp.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    planModules = SCALE_WITH_HUBS;
  });

  it("isDemoEmail accepts demo@goops.co.za (case/whitespace-insensitive) and still rejects others", async () => {
    const { isDemoEmail } = await import("@/lib/demo/accounts");
    expect(isDemoEmail("demo@goops.co.za")).toBe(true);
    expect(isDemoEmail(" Demo@GOOPS.co.za ")).toBe(true);
    expect(isDemoEmail("demo@goops.co.za.evil.com")).toBe(false);
    expect(isDemoEmail("someone@goops.co.za")).toBe(false);
    expect(isDemoEmail("demo-admin@example.com")).toBe(true);
    expect(isDemoEmail(null)).toBe(false);
  });

  it("does not offer goops as a switch target and gives it no mapped role", async () => {
    const { demoRoleOptions, findDemoAccountByEmail, DEMO_ACCOUNTS } = await import(
      "@/lib/demo/accounts"
    );
    expect(DEMO_ACCOUNTS.some((a) => a.email === "demo@goops.co.za")).toBe(false);
    expect(demoRoleOptions().map((o) => o.role)).not.toContain("demo@goops.co.za");
    expect(findDemoAccountByEmail("demo@goops.co.za")).toBeNull();
  });

  it("renders the switcher for demo@goops.co.za with no current role", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u-goops", email: "demo@goops.co.za" } },
    });
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    const el = (await DemoRoleSwitcher()) as { props: Record<string, unknown> };
    expect(el).not.toBeNull();
    expect(el.props.currentEmail).toBe("demo@goops.co.za");
    expect(el.props.currentRole).toBeUndefined();
  });

  it("does not render the switcher for goops when the guard is off", async () => {
    setEnv(undefined, DEMO_URL);
    const { DemoRoleSwitcher } = await import("@/components/demo/role-switcher");
    expect(await DemoRoleSwitcher()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("lets demo@goops.co.za switch into a demo role", async () => {
    setEnv("true", DEMO_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u-goops-switch", email: "demo@goops.co.za" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "dispatcher" }));
    expect(res.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "demo-dispatcher@example.com",
    });
  });

  it("still refuses goops on a non-demo project", async () => {
    setEnv("true", LIVE_URL);
    getUser.mockResolvedValue({
      data: { user: { id: "u-goops-live", email: "demo@goops.co.za" } },
    });
    const { POST } = await import("@/app/api/demo/switch/route");
    const res = await POST(req({ role: "dispatcher" }));
    expect(res.status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });
});

describe("findDemoAccountByEmail", () => {
  it("matches case-insensitively and rejects unknown emails", async () => {
    const { findDemoAccountByEmail } = await import("@/lib/demo/accounts");
    expect(findDemoAccountByEmail(" DEMO-employee@example.com ")).toMatchObject({
      role: "employee",
      requiresModule: "passengers",
    });
    expect(findDemoAccountByEmail("demo-client@example.com")?.requiresModule).toBe("portal");
    expect(findDemoAccountByEmail("demo-admin@example.com")?.requiresModule).toBeUndefined();
    expect(findDemoAccountByEmail("someone@else.com")).toBeNull();
    expect(findDemoAccountByEmail(null)).toBeNull();
  });
});
