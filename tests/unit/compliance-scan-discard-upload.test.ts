import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "a0000000-0000-4000-8000-000000000011" } },
        error: null,
      }),
    },
  })),
}));

vi.mock("@/services/compliance-documents.server", () => ({
  resolveComplianceAuth: vi.fn().mockResolvedValue({
    ok: true,
    ctx: {
      userId: "a0000000-0000-4000-8000-000000000011",
      organisationId: "a0000000-0000-4000-8000-000000000001",
      source: "admin",
      reviewStatus: "accepted",
      isOps: true,
    },
  }),
  buildComplianceStoragePath: vi.fn(() => "org/tmp-scan/x.jpg"),
  mimeToExt: vi.fn(() => "jpg"),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: table === "organisations" ? { compliance_scan_enabled: false } : null,
        error: null,
      }),
    })),
    storage: { from: vi.fn(() => ({ upload: vi.fn() })) },
  })),
}));

describe("X12 scan_discard blocked when flag off", () => {
  beforeEach(() => {
    delete process.env.COMPLIANCE_SCAN_ENABLED;
  });

  it("returns scan_disabled before upload", async () => {
    const { POST } = await import("@/app/api/compliance/documents/route");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const form = new FormData();
    form.set("subject_kind", "driver");
    form.set("subject_id", "a0000000-0000-4000-8000-000000000201");
    form.set("doc_type", "driver_licence");
    form.set("side", "single");
    form.set("storage_mode", "scan_discard");
    form.set("file", new File([jpeg], "x.jpg", { type: "image/jpeg" }));

    const res = await POST(new Request("http://localhost/api/compliance/documents", { method: "POST", body: form }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("scan_disabled");
  });
});
