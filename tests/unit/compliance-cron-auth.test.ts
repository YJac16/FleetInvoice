import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser },
    rpc: vi.fn(),
  })),
}));

const fromChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  update: vi.fn().mockReturnThis(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
    from: vi.fn(() => fromChain),
  })),
}));

describe("cron bearer auth", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret-value";
    process.env.NOTIFICATIONS_PROCESS_SECRET = "notifications-secret-value";
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("rejects missing bearer on compliance-alerts", async () => {
    const { GET } = await import("@/app/api/cron/compliance-alerts/route");
    const res = await GET(new Request("http://localhost/api/cron/compliance-alerts"));
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer on compliance-alerts", async () => {
    const { GET } = await import("@/app/api/cron/compliance-alerts/route");
    const res = await GET(
      new Request("http://localhost/api/cron/compliance-alerts", {
        headers: { Authorization: "Bearer wrong-secret" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("accepts CRON_SECRET bearer on compliance-alerts", async () => {
    const { GET } = await import("@/app/api/cron/compliance-alerts/route");
    const res = await GET(
      new Request("http://localhost/api/cron/compliance-alerts", {
        headers: { Authorization: "Bearer cron-secret-value" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("accepts NOTIFICATIONS_PROCESS_SECRET bearer on compliance-alerts", async () => {
    const { GET } = await import("@/app/api/cron/compliance-alerts/route");
    const res = await GET(
      new Request("http://localhost/api/cron/compliance-alerts", {
        headers: { Authorization: "Bearer notifications-secret-value" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("accepts CRON_SECRET on notifications process route", async () => {
    const { POST } = await import("@/app/api/notifications/process/route");
    const res = await POST(
      new Request("http://localhost/api/notifications/process", {
        method: "POST",
        headers: { Authorization: "Bearer cron-secret-value" },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("middleware bearer API passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("does not redirect exact allowlisted bearer routes without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import("@/lib/supabase/middleware");

    for (const path of [
      "/api/notifications/process",
      "/api/cron/compliance-alerts",
      "/api/cron/compliance-digest",
      "/api/cron/notifications",
    ]) {
      const req = new NextRequest(new URL(`http://localhost${path}`));
      const res = await updateSession(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("location") ?? "").not.toMatch(/login/);
    }
  });

  it("redirects subpaths that are not exactly allowlisted", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import("@/lib/supabase/middleware");

    for (const path of [
      "/api/notifications/process/extra",
      "/api/cron/compliance-alerts/extra",
    ]) {
      const req = new NextRequest(new URL(`http://localhost${path}`));
      const res = await updateSession(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    }
  });

  it("redirects non-cron protected routes without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest(new URL("http://localhost/hub"));
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
