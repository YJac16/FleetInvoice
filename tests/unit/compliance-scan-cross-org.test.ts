import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const rpc = vi.fn();
const storageDownload = vi.fn();
const fromImpl = vi.fn();

/** Records every .eq() filter applied per table so we can assert scoping. */
const eqCalls: Record<string, Array<[string, unknown]>> = {};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({
    from: fromImpl,
    storage: { from: vi.fn(() => ({ download: storageDownload, remove: vi.fn() })) },
    rpc,
  })),
}));

const OWN_ORG = "org-own";
const OTHER_ORG = "org-other";
const OWN_DRIVER = "a0000000-0000-4000-8000-000000000201";
const OTHER_ORG_DOC = "a0000000-0000-4000-8000-000000000999";

/** Simulates the database: the document exists, but in another organisation. */
const documents = [
  { id: OTHER_ORG_DOC, organisation_id: OTHER_ORG, driver_id: "other-driver", storage_path: "other/doc.jpg" },
];

describe("compliance scan: retained documents are scoped to the caller's org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(eqCalls)) delete eqCalls[key];
    process.env.COMPLIANCE_SCAN_ENABLED = "true";
    process.env.COMPLIANCE_SCAN_PROVIDER = "mock";
    vi.stubEnv("NODE_ENV", "test");
    getUser.mockResolvedValue({ data: { user: { id: "manager-1" } }, error: null });
    storageDownload.mockResolvedValue({ data: new Blob([new Uint8Array([1])]), error: null });
    rpc.mockResolvedValue({ data: true, error: null });

    fromImpl.mockImplementation((table: string) => {
      const filters: Array<[string, unknown]> = [];
      eqCalls[table] = filters;
      const chain = {
        select: vi.fn(() => chain),
        is: vi.fn(() => chain),
        eq: vi.fn((col: string, val: unknown) => {
          filters.push([col, val]);
          return chain;
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        maybeSingle: vi.fn(async () => {
          if (table === "organisations") return { data: { compliance_scan_enabled: true } };
          if (table === "organisation_members") return { data: { role: "manager" } };
          if (table === "drivers") return { data: { organisation_id: OWN_ORG } };
          if (table === "driver_documents" || table === "vehicle_documents") {
            const match = documents.find((doc) =>
              filters.every(([col, val]) => (doc as Record<string, unknown>)[col] === val)
            );
            return { data: match ? { storage_path: match.storage_path } : null };
          }
          return { data: null };
        }),
      };
      return chain;
    });
  });

  it("does not read another organisation's document", async () => {
    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "driver_licence",
          subject_id: OWN_DRIVER,
          document_id: OTHER_ORG_DOC,
          storage_mode: "retained",
        }),
      })
    );

    expect(res.status).toBe(404);
    expect(storageDownload).not.toHaveBeenCalled();
    expect(eqCalls.driver_documents).toEqual(
      expect.arrayContaining([
        ["organisation_id", OWN_ORG],
        ["driver_id", OWN_DRIVER],
      ])
    );
  });
});
