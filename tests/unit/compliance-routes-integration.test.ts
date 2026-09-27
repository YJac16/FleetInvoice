import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const createSignedUrl = vi.fn();
const rpc = vi.fn();
const fromChain = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: fromChain,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    from: fromChain,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl,
        download: vi.fn(),
        remove: vi.fn(),
        upload: vi.fn(),
      })),
    },
    rpc,
  })),
}));

describe("compliance route integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPLIANCE_SCAN_ENABLED = "true";
    process.env.COMPLIANCE_SCAN_PROVIDER = "mock";
    vi.stubEnv("NODE_ENV", "test");
  });

  it("S8 view route uses 60 second signed URL and writes audit", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    fromChain.mockImplementation((table: string) => {
      const base = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        is: vi.fn().mockReturnThis(),
      };
      if (table === "driver_documents") {
        base.maybeSingle.mockResolvedValue({
          data: {
            id: "doc-1",
            organisation_id: "org-1",
            storage_path: "org/drivers/x/a.jpg",
            deleted_at: null,
          },
          error: null,
        });
      } else {
        base.maybeSingle.mockResolvedValue({ data: null, error: null });
      }
      return base;
    });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.test/signed" },
      error: null,
    });
    rpc.mockResolvedValue({ data: "audit-id", error: null });

    const { GET } = await import("@/app/api/compliance/documents/[id]/view/route");
    const res = await GET(new NextRequest("http://localhost/api/compliance/documents/doc-1/view"), {
      params: Promise.resolve({ id: "doc-1" }),
    });
    expect(res.status).toBe(302);
    expect(createSignedUrl).toHaveBeenCalledWith("org/drivers/x/a.jpg", 60);
    expect(rpc).toHaveBeenCalledWith(
      "write_audit_log",
      expect.objectContaining({ p_action: "document.viewed" })
    );
  });

  it("X2 returns 429 when quota RPC returns false", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    fromChain.mockImplementation((table: string) => {
      if (table === "compliance_scan_events") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            table === "organisations"
              ? { compliance_scan_enabled: true }
              : table === "organisation_members"
                ? { role: "organisation_admin" }
                : table === "drivers"
                  ? { organisation_id: "org-1" }
                  : null,
          error: null,
        }),
        is: vi.fn().mockReturnThis(),
      };
    });
    rpc.mockImplementation((name: string) => {
      if (name === "consume_compliance_scan_quota") {
        return Promise.resolve({ data: false, error: null });
      }
      if (name === "register_compliance_document") {
        return Promise.resolve({ data: false, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: "a0000000-0000-4000-8000-000000000201",
          document_id: "a0000000-0000-4000-8000-000000000301",
          storage_mode: "retained",
        }),
      })
    );
    expect(res.status).toBe(429);
  });

  it("X3 returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: "a0000000-0000-4000-8000-000000000201",
          document_id: "a0000000-0000-4000-8000-000000000301",
        }),
      })
    );
    expect(res.status).toBe(401);
  });
});
