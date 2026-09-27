import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { normaliseScanResult } from "@/lib/compliance/scan-normalise";
import { mockExtractCompliance } from "@/lib/compliance/scan/mock-provider";
import { resolveComplianceAuth } from "@/services/compliance-documents.server";

const fromMock = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock })),
}));

describe("NaTIS RC scan-only policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation((table: string) => {
      if (table === "organisation_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    organisation_id: "a0000000-0000-4000-8000-000000000001",
                    role: "organisation_admin",
                    status: "active",
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "vehicles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              organisation_id: "a0000000-0000-4000-8000-000000000001",
              id: "a0000000-0000-4000-8000-000000000601",
              deleted_at: null,
            },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it("RC-API denies retained upload auth", async () => {
    const result = await resolveComplianceAuth({
      userId: "a0000000-0000-4000-8000-000000000011",
      fields: {
        subject_kind: "vehicle",
        subject_id: "a0000000-0000-4000-8000-000000000601",
        doc_type: "registration_certificate",
        side: "single",
        storage_mode: "retained",
      },
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "rc_permanent_storage_forbidden",
    });
  });

  it("RC-normalise drops owner PII from scan suggestions", async () => {
    const raw = await mockExtractCompliance("registration_certificate", new Uint8Array());
    const out = normaliseScanResult("registration_certificate", raw, "CA123456");
    expect(out.fields.registration_number?.value).toBe("CA123456");
    expect(out.fields.make?.value).toBe("Toyota");
    expect(out.fields.owner_name).toBeUndefined();
    expect(out.fields.owner_id_number).toBeUndefined();
    expect(out.fields.owner_address).toBeUndefined();
  });

  it("RC-scan rejects retained document_id scan", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "a0000000-0000-4000-8000-000000000011" } },
      error: null,
    });
    const { POST } = await import("@/app/api/compliance/scan/route");
    const res = await POST(
      new NextRequest("http://localhost/api/compliance/scan", {
        method: "POST",
        body: JSON.stringify({
          subject_kind: "registration_certificate",
          subject_id: "a0000000-0000-4000-8000-000000000601",
          document_id: "a0000000-0000-4000-8000-000000000701",
          storage_mode: "retained",
          doc_type: "registration_certificate",
        }),
      })
    );
    expect(res.status).toBe(403);
  });
});
