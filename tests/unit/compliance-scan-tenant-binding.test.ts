import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const rpc = vi.fn();
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
        download: storageDownload,
        remove: vi.fn(),
      })),
    },
    rpc,
  })),
}));

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const DRIVER_A = "a0000000-0000-4000-8000-000000000201";
const DOC_B = "b0000000-0000-4000-8000-000000000301";
const DOC_A = "a0000000-0000-4000-8000-000000000301";

/** Returns `row` only when every eq() filter matches the stored record. */
function chain(
  stored: Record<string, string> | null,
  row: Record<string, unknown> | null
) {
  const seen: Record<string, string> = {};
  const api = {
    select: vi.fn(() => api),
    eq: vi.fn((column: string, value: string) => {
      seen[column] = value;
      return api;
    }),
    is: vi.fn(() => api),
    maybeSingle: vi.fn(async () => {
      if (!stored || !row) return { data: null, error: null };
      const matches = Object.entries(seen).every(
        ([key, value]) => stored[key] === undefined || stored[key] === value
      );
      return { data: matches ? row : null, error: null };
    }),
    insert: vi.fn(async () => ({ error: null })),
    update: vi.fn(() => api),
  };
  return api;
}

describe("compliance scan retained document binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPLIANCE_SCAN_ENABLED = "true";
    process.env.COMPLIANCE_SCAN_PROVIDER = "mock";
    vi.stubEnv("NODE_ENV", "test");
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
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
  });

  function mockTables(document: {
    id: string;
    organisation_id: string;
    driver_id: string;
    storage_path: string;
  } | null) {
    fromImpl.mockImplementation((table: string) => {
      if (table === "organisations") {
        return chain({ id: ORG_A }, { compliance_scan_enabled: true });
      }
      if (table === "organisation_members") {
        return chain(
          { organisation_id: ORG_A, user_id: "admin-1", status: "active" },
          { role: "organisation_admin" }
        );
      }
      if (table === "drivers") {
        return chain({ id: DRIVER_A }, { organisation_id: ORG_A });
      }
      if (table === "driver_documents") {
        return chain(
          document,
          document ? { storage_path: document.storage_path } : null
        );
      }
      if (table === "compliance_scan_events") {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      if (table === "vehicles") {
        return chain(null, null);
      }
      return chain(null, null);
    });
  }

  it("does not download a document that belongs to another organisation", async () => {
    mockTables({
      id: DOC_B,
      organisation_id: "b0000000-0000-4000-8000-000000000001",
      driver_id: "b0000000-0000-4000-8000-000000000201",
      storage_path: "org-b/secret.jpg",
    });

    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: DRIVER_A,
          document_id: DOC_B,
          storage_mode: "retained",
        }),
      })
    );

    expect(res.status).toBe(404);
    expect(storageDownload).not.toHaveBeenCalled();
  });

  it("downloads a retained document when org and driver match", async () => {
    mockTables({
      id: DOC_A,
      organisation_id: ORG_A,
      driver_id: DRIVER_A,
      storage_path: "org-a/licence.jpg",
    });

    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: DRIVER_A,
          document_id: DOC_A,
          storage_mode: "retained",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(storageDownload).toHaveBeenCalledWith("org-a/licence.jpg");
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    mockTables(null);
    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: DRIVER_A,
          document_id: DOC_A,
          storage_mode: "retained",
        }),
      })
    );
    expect(res.status).toBe(401);
    expect(storageDownload).not.toHaveBeenCalled();
  });
});
