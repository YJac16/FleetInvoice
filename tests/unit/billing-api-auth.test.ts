import { describe, expect, it, vi, beforeEach } from "vitest";

const assertBillingManageAccess = vi.fn();
const getUser = vi.fn();
const getStripe = vi.fn();

vi.mock("@/lib/auth/billing-access", () => ({
  assertBillingManageAccess,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: vi.fn(),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => null),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe,
}));

describe("billing API routes (authorization only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStripe.mockReturnValue({ checkout: { sessions: { create: vi.fn() } } });
  });

  it("checkout returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ organisationId: "org-a", planId: "plan-1" }),
      })
    );
    expect(res.status).toBe(401);
    expect(assertBillingManageAccess).not.toHaveBeenCalled();
  });

  it("checkout returns 403 when billing access denied", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@test" } } });
    assertBillingManageAccess.mockRejectedValue(
      new Error("Not authorised to manage billing for this organisation")
    );
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          organisationId: "00000000-0000-4000-8000-000000000099",
          planId: "plan-1",
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(assertBillingManageAccess).toHaveBeenCalledWith(
      expect.anything(),
      "00000000-0000-4000-8000-000000000099"
    );
  });

  it("portal returns 403 for cross-org organisationId", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@test" } } });
    assertBillingManageAccess.mockRejectedValue(
      new Error("Not authorised to manage billing for this organisation")
    );
    const { POST } = await import("@/app/api/billing/portal/route");
    const res = await POST(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        body: JSON.stringify({
          organisationId: "b0000000-0000-4000-8000-000000000001",
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});
