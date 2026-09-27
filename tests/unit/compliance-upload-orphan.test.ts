import { describe, expect, it, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const storageRemove = vi.fn();
const storageUpload = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
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
  buildComplianceStoragePath: vi.fn(() => "org/drivers/x/spec.jpg"),
  mimeToExt: vi.fn(() => "jpg"),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: storageUpload,
        remove: storageRemove,
      })),
    },
    rpc,
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
}));

describe("S14 orphan cleanup on registration failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageUpload.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: { id: "a0000000-0000-4000-8000-000000000011" } },
      error: null,
    });
    rpc.mockImplementation((name: string) => {
      if (name === "register_compliance_document") {
        return Promise.resolve({ data: null, error: { message: "fail" } });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it("removes storage object and returns registration_failed without path", async () => {
    const { POST } = await import("@/app/api/compliance/documents/route");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const form = new FormData();
    form.set("subject_kind", "driver");
    form.set("subject_id", "a0000000-0000-4000-8000-000000000201");
    form.set("doc_type", "driver_licence");
    form.set("side", "single");
    form.set("storage_mode", "retained");
    form.set("file", new File([jpeg], "specimen.jpg", { type: "image/jpeg" }));

    const res = await POST(new Request("http://localhost/api/compliance/documents", { method: "POST", body: form }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(500);
    expect(body.error).toBe("registration_failed");
    expect(body.storage_path).toBeUndefined();
    expect(storageRemove).toHaveBeenCalled();
  });

});
