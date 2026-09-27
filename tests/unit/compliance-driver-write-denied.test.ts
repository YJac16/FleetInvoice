import { describe, expect, it, vi, beforeEach } from "vitest";

import { resolveComplianceAuth } from "@/services/compliance-documents.server";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({ from: fromMock })),
}));

describe("driver compliance write denial (API)", () => {
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
                    role: "driver",
                    status: "active",
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "drivers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              organisation_id: "a0000000-0000-4000-8000-000000000001",
              id: "a0000000-0000-4000-8000-000000000201",
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

  it("D-API denies driver compliance upload auth", async () => {
    const result = await resolveComplianceAuth({
      userId: "a0000000-0000-4000-8000-000000000012",
      fields: {
        subject_kind: "driver",
        subject_id: "a0000000-0000-4000-8000-000000000201",
        doc_type: "driver_licence",
        side: "single",
        storage_mode: "retained",
      },
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "driver_compliance_write_forbidden",
    });
  });
});
