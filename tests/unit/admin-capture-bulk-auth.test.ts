import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const rpc = vi.fn();
const fromChain = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    from: fromChain,
    rpc,
  })),
}));

describe("admin capture bulk routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "driver-user" } }, error: null });
    fromChain.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { role: "driver" },
        error: null,
      }),
    });
  });

  it("returns 403 for non-admin before invalid body fields (drivers bulk)", async () => {
    const { POST } = await import("@/app/api/capture/drivers/bulk/route");
    const res = await POST(
      new NextRequest("http://localhost/api/capture/drivers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: "a0000000-0000-4000-8000-000000000001",
          rows: [{ not_a_valid_field: true }],
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin before invalid body fields (vehicles bulk)", async () => {
    const { POST } = await import("@/app/api/capture/vehicles/bulk/route");
    const res = await POST(
      new NextRequest("http://localhost/api/capture/vehicles/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: "a0000000-0000-4000-8000-000000000001",
          rows: [{ bad: true }],
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
