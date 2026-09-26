import { describe, expect, it, vi, beforeEach } from "vitest";

const exchangeCodeForSession = vi.fn();
const createClient = vi.fn(async () => ({
  auth: { exchangeCodeForSession },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

describe("OAuth callback redirect sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("rejects open-redirect next param", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(
      new Request(
        "http://localhost/auth/callback?code=fake&next=//evil.example/phish"
      )
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/hub");
  });

  it("allows safe in-app next path", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(
      new Request("http://localhost/auth/callback?code=fake&next=/invoices")
    );
    expect(res.headers.get("location")).toBe("http://localhost/invoices");
  });
});
