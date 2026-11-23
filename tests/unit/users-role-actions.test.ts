/**
 * Step 6 (GoOps refocus) — server-side role assignment check
 * (lib/auth/role-assignment.ts) via the users server actions. Assigning
 * company_manager / employee is refused unless the org is entitled to portal /
 * passengers, before create_invitation or the member update runs.
 * Run: npm run test:role-entitlements
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_PORTAL = "a0000000-0000-4000-8000-000000000001"; // core + portal
const ORG_PASS = "b0000000-0000-4000-8000-000000000001"; // core + passengers
const ORG_CORE = "c0000000-0000-4000-8000-000000000001"; // core only
const ORG_NONE = "d0000000-0000-4000-8000-000000000001"; // no subscription -> fail-open

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function seed() {
  tables.profiles = [
    { id: "u-owner", is_platform_owner: true },
    { id: "u-admin", is_platform_owner: false },
    { id: "u-driver", is_platform_owner: false },
  ];
  tables.organisation_members = [
    ...[ORG_PORTAL, ORG_PASS, ORG_CORE, ORG_NONE].map((org) => ({
      organisation_id: org,
      user_id: "u-admin",
      role: "organisation_admin",
      status: "active",
    })),
    { organisation_id: ORG_CORE, user_id: "u-driver", role: "driver", status: "active" },
  ];
  tables.subscriptions = [
    { organisation_id: ORG_PORTAL, plan_id: "p-portal", status: "active" },
    { organisation_id: ORG_PASS, plan_id: "p-pass", status: "active" },
    { organisation_id: ORG_CORE, plan_id: "p-core", status: "active" },
  ];
  tables.module_entitlements = [
    { plan_id: "p-portal", module_key: "core" },
    { plan_id: "p-portal", module_key: "portal" },
    { plan_id: "p-pass", module_key: "core" },
    { plan_id: "p-pass", module_key: "passengers" },
    { plan_id: "p-core", module_key: "core" },
  ];
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const run = () => ({
    data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))),
    error: null,
  });
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

/** Member rows the signed-in user can see under RLS (id -> org). */
const visibleMembers: Record<string, string> = {
  "m-core": ORG_CORE,
  "m-pass": ORG_PASS,
};

const userUpdate = vi.fn();
const userRpc = vi.fn(async () => ({ data: { id: "inv-1", token: "t" }, error: null }));
let sessionUser: string | null = null;

function userFrom() {
  let id: unknown = null;
  const b: Record<string, unknown> = {
    select: () => b,
    is: () => b,
    eq: (col: string, v: unknown) => {
      if (col === "id") id = v;
      return b;
    },
    maybeSingle: async () => {
      const org = visibleMembers[String(id)];
      return { data: org ? { id, organisation_id: org } : null, error: null };
    },
    update: (values: unknown) => {
      userUpdate(values);
      return b;
    },
    single: async () => ({
      data: { id, organisation_id: visibleMembers[String(id)] },
      error: null,
    }),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: sessionUser ? { id: sessionUser } : null },
      })),
    },
    from: userFrom,
    rpc: userRpc,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => ({ from: (t: string) => query(t) })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  sessionUser = "u-admin";
});

async function invite(organisationId: string, role: string) {
  const { createInvitationAction } = await import("@/features/users/actions");
  return createInvitationAction({ organisationId, email: "new@example.com", role });
}

async function changeRole(memberId: string, role: string) {
  const { updateMemberRoleAction } = await import("@/features/users/actions");
  return updateMemberRoleAction({ memberId, role });
}

describe("createInvitationAction", () => {
  it("refuses company_manager in a core-only org without calling the RPC", async () => {
    const res = await invite(ORG_CORE, "company_manager");
    expect(res).toMatchObject({ ok: false, status: 403, error: "role_not_entitled" });
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("refuses employee in a core-only org and in a fail-open org", async () => {
    for (const org of [ORG_CORE, ORG_NONE, ORG_PORTAL]) {
      const res = await invite(org, "employee");
      expect(res).toMatchObject({ ok: false, status: 403, error: "role_not_entitled" });
    }
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("refuses company_manager in a passengers-only org", async () => {
    const res = await invite(ORG_PASS, "company_manager");
    expect(res).toMatchObject({ ok: false, status: 403, error: "role_not_entitled" });
  });

  it("allows company_manager with portal and employee with passengers", async () => {
    expect(await invite(ORG_PORTAL, "company_manager")).toMatchObject({ ok: true });
    expect(await invite(ORG_PASS, "employee")).toMatchObject({ ok: true });
    expect(userRpc).toHaveBeenCalledTimes(2);
    expect(userRpc).toHaveBeenCalledWith("create_invitation", {
      p_organisation_id: ORG_PASS,
      p_email: "new@example.com",
      p_role: "employee",
    });
  });

  it("drivers and ops roles are unchanged in every org", async () => {
    for (const org of [ORG_CORE, ORG_NONE]) {
      for (const role of ["driver", "dispatcher", "manager", "supervisor", "organisation_admin"]) {
        expect(await invite(org, role)).toMatchObject({ ok: true });
      }
    }
  });

  it("platform owner bypasses entitlement", async () => {
    sessionUser = "u-owner";
    expect(await invite(ORG_CORE, "employee")).toMatchObject({ ok: true });
  });

  it("401 when signed out, 403 for non-members and members without users:manage", async () => {
    sessionUser = null;
    expect(await invite(ORG_CORE, "driver")).toMatchObject({ ok: false, status: 401 });
    sessionUser = "u-driver";
    expect(await invite(ORG_CORE, "driver")).toMatchObject({ ok: false, status: 403, error: "forbidden" });
    expect(await invite(ORG_PORTAL, "driver")).toMatchObject({ ok: false, status: 403, error: "forbidden" });
    expect(userRpc).not.toHaveBeenCalled();
  });

  it("400 for roles that can't be invited", async () => {
    expect(await invite(ORG_CORE, "platform_owner")).toMatchObject({ ok: false, status: 400 });
    expect(userRpc).not.toHaveBeenCalled();
  });
});

describe("updateMemberRoleAction", () => {
  it("refuses changing a member to employee in a core-only org", async () => {
    const res = await changeRole("m-core", "employee");
    expect(res).toMatchObject({ ok: false, status: 403, error: "role_not_entitled" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses company_manager in a passengers-only org", async () => {
    const res = await changeRole("m-pass", "company_manager");
    expect(res).toMatchObject({ ok: false, status: 403, error: "role_not_entitled" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("allows employee in a passengers org and driver anywhere", async () => {
    expect(await changeRole("m-pass", "employee")).toMatchObject({ ok: true });
    expect(await changeRole("m-core", "driver")).toMatchObject({
      ok: true,
      data: { id: "m-core", organisation_id: ORG_CORE },
    });
    expect(userUpdate).toHaveBeenCalledWith({ role: "driver" });
  });

  it("404 for a member the caller can't see", async () => {
    const res = await changeRole("m-other", "driver");
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
