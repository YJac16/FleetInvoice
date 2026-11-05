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

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const ADMIN_A = "a0000000-0000-4000-8000-000000000011";
const OTHER_USER = "b0000000-0000-4000-8000-000000000011";

function memberLookupForUser(userId: string, orgId: string) {
  fromChain.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data:
        userId === ADMIN_A && orgId === ORG_A
          ? { role: "organisation_admin" }
          : null,
      error: null,
    }),
  });
}

describe("/api/audit/log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: "audit-id-1", error: null });
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/api/audit/log/route");
    const res = await POST(
      new NextRequest("http://localhost/api/audit/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: ORG_A,
          action: "member.role_updated",
          entityType: "organisation_member",
        }),
      })
    );
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for cross-org member write", async () => {
    getUser.mockResolvedValue({ data: { user: { id: OTHER_USER } }, error: null });
    memberLookupForUser(OTHER_USER, ORG_A);
    const { POST } = await import("@/app/api/audit/log/route");
    const res = await POST(
      new NextRequest("http://localhost/api/audit/log", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG_A,
          action: "member.role_updated",
          entityType: "organisation_member",
          entityId: "a0000000-0000-4000-8000-000000000099",
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for disallowed fleet/document action", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ADMIN_A } }, error: null });
    memberLookupForUser(ADMIN_A, ORG_A);
    const { POST } = await import("@/app/api/audit/log/route");
    const res = await POST(
      new NextRequest("http://localhost/api/audit/log", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG_A,
          action: "document.deleted",
          entityType: "compliance_document",
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ignores forged actor in body and uses session user in RPC", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ADMIN_A } }, error: null });
    memberLookupForUser(ADMIN_A, ORG_A);
    const { POST } = await import("@/app/api/audit/log/route");
    const res = await POST(
      new NextRequest("http://localhost/api/audit/log", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG_A,
          action: "invitation.created",
          entityType: "invitation",
          entityId: "a0000000-0000-4000-8000-000000000099",
          p_actor: OTHER_USER,
          actorId: OTHER_USER,
        }),
      })
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();

    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: "audit-id-1", error: null });
    memberLookupForUser(ADMIN_A, ORG_A);
    const okRes = await POST(
      new NextRequest("http://localhost/api/audit/log", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG_A,
          action: "invitation.created",
          entityType: "invitation",
          entityId: "a0000000-0000-4000-8000-000000000099",
        }),
      })
    );
    expect(okRes.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "write_audit_log",
      expect.objectContaining({
        p_actor: ADMIN_A,
        p_action: "invitation.created",
      })
    );
  });

  it("returns 403 when a driver forges a privileged audit event", async () => {
    const driverId = "a0000000-0000-4000-8000-000000000012";
    getUser.mockResolvedValue({ data: { user: { id: driverId } }, error: null });
    fromChain.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data:
          table === "organisation_members"
            ? { role: "driver" }
            : table === "profiles"
              ? { is_platform_owner: false }
              : null,
        error: null,
      }),
    }));

    const { POST } = await import("@/app/api/audit/log/route");
    const res = await POST(
      new NextRequest("http://localhost/api/audit/log", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG_A,
          action: "organisation.deleted",
          entityType: "organisation",
          entityId: ORG_A,
        }),
      })
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows a platform owner whose membership role is not an ops role", async () => {
    const ownerId = "f0000000-0000-4000-8000-000000000001";
    getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
    fromChain.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data:
          table === "organisation_members"
            ? { role: "driver" }
            : table === "profiles"
              ? { is_platform_owner: true }
              : null,
        error: null,
      }),
    }));

    const { POST } = await import("@/app/api/audit/log/route");
    const res = await POST(
      new NextRequest("http://localhost/api/audit/log", {
        method: "POST",
        body: JSON.stringify({
          organisationId: ORG_A,
          action: "organisation.updated",
          entityType: "organisation",
          entityId: ORG_A,
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "write_audit_log",
      expect.objectContaining({ p_actor: ownerId })
    );
  });
});
