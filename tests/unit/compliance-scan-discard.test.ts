import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const rpc = vi.fn();
const storageRemove = vi.fn();
const storageDownload = vi.fn();
const fromImpl = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    from: fromImpl,
    storage: {
      from: vi.fn(() => ({
        remove: storageRemove,
        download: storageDownload,
      })),
    },
    rpc,
  })),
}));

describe("scan-and-discard (X10–X12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPLIANCE_SCAN_ENABLED = "true";
    process.env.COMPLIANCE_SCAN_PROVIDER = "mock";
    vi.stubEnv("NODE_ENV", "test");
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    storageRemove.mockResolvedValue({ error: null });
    storageDownload.mockResolvedValue({
      data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]),
      error: null,
    });
    rpc.mockImplementation((name: string) => {
      if (name === "consume_compliance_scan_quota") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    fromImpl.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        update: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
      };
      if (table === "organisations") {
        chain.maybeSingle.mockResolvedValue({ data: { compliance_scan_enabled: true }, error: null });
      } else if (table === "organisation_members") {
        chain.maybeSingle.mockResolvedValue({ data: { role: "organisation_admin" }, error: null });
      } else if (table === "drivers") {
        chain.maybeSingle.mockResolvedValue({ data: { organisation_id: "org-1" }, error: null });
      } else if (table === "compliance_scan_temp_objects") {
        chain.maybeSingle.mockResolvedValue({
          data: {
            storage_path: "org/tmp-scan/temp.jpg",
            organisation_id: "org-1",
            deleted_at: null,
          },
          error: null,
        });
        chain.eq.mockReturnValue(chain);
      } else if (table === "compliance_scan_events") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      } else if (table === "vehicles") {
        chain.maybeSingle.mockResolvedValue({ data: { registration_number: "CA123456" }, error: null });
      }
      return chain;
    });
  });

  it("X10 deletes temp object after successful scan", async () => {
    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: "a0000000-0000-4000-8000-000000000201",
          temp_scan_id: "a0000000-0000-4000-8000-000000000401",
          storage_mode: "scan_discard",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(storageRemove).toHaveBeenCalledWith(["org/tmp-scan/temp.jpg"]);
  });

  it("X11 deletes temp object after provider failure", async () => {
    process.env.COMPLIANCE_SCAN_MOCK_FAIL = "1";
    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: "a0000000-0000-4000-8000-000000000201",
          temp_scan_id: "a0000000-0000-4000-8000-000000000401",
          storage_mode: "scan_discard",
        }),
      })
    );
    delete process.env.COMPLIANCE_SCAN_MOCK_FAIL;
    const body = (await res.json()) as { message?: string };
    expect(res.status).toBe(502);
    expect(body.message).toMatch(/Couldn't read the document/);
    expect(storageRemove).toHaveBeenCalled();
  });
});
