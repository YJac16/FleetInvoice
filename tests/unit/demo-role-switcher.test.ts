import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
const signOut = vi.fn();
const verifyOtp = vi.fn();
const generateLink = vi.fn();
const createClient = vi.fn(async () => ({
  auth: { getUser, signOut, verifyOtp },
}));
const createServiceClient = vi.fn(() => ({
  auth: { admin: { generateLink } },
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { id: "org-demo" }, error: null }),
      }),
    }),
  }),
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
});
