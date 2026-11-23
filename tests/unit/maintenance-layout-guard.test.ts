/**
 * U4 — server guard in app/(dashboard)/maintenance/layout.tsx.
 * Session, Next navigation and the service client are faked.
 * Run: npm run test:maintenance-u4
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "a0000000-0000-4000-8000-000000000001"; // entitled
const ORG_C = "c0000000-0000-4000-8000-000000000001"; // core plan only
const ORG_D = "d0000000-0000-4000-8000-000000000001"; // no subscription at all

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

const ROLE_USERS = {
  organisation_admin: "u-admin",
  manager: "u-manager",
  dispatcher: "u-dispatcher",
  supervisor: "u-supervisor",
  driver: "u-driver",
  employee: "u-employee",
  company_manager: "u-company-manager",
} as const;

function seed() {
  tables.profiles = [
    { id: "u-owner", is_platform_owner: true },
    ...Object.values(ROLE_USERS).map((id) => ({ id, is_platform_owner: false })),
    { id: "u-admin-c", is_platform_owner: false },
    { id: "u-admin-d", is_platform_owner: false },
  ];
  tables.organisation_members = [
    ...Object.entries(ROLE_USERS).map(([role, user_id]) => ({
      organisation_id: ORG_A,
      user_id,
      role,
      status: "active",
    })),
    { organisation_id: ORG_C, user_id: "u-admin-c", role: "organisation_admin", status: "active" },
    { organisation_id: ORG_D, user_id: "u-admin-d", role: "organisation_admin", status: "active" },
  ];
  tables.subscriptions = [
    { organisation_id: ORG_A, plan_id: "p-maint", status: "active" },
    { organisation_id: ORG_C, plan_id: "p-core", status: "active" },
  ];
  tables.module_entitlements = [
    { plan_id: "p-maint", module_key: "maintenance" },
    { plan_id: "p-core", module_key: "core" },
  ];
}

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let max = Infinity;
  const run = () => ({
    data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, max),
    error: null,
  });
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
    limit: (n: number) => ((max = n), b),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

let serviceAvailable = true;
const getSessionContext = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => (serviceAvailable ? { from: (t: string) => query(t) } : null)),
}));

function signIn(userId: string | null, organisationId: string | null = ORG_A) {
  getSessionContext.mockResolvedValue(
    userId ? { userId, activeOrganisationId: organisationId, isPlatformOwner: userId === "u-owner" } : null
  );
}

async function render() {
  const { default: MaintenanceLayout } = await import("@/app/(dashboard)/maintenance/layout");
  return MaintenanceLayout({ children: "page" });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  serviceAvailable = true;
});

describe("maintenance layout guard", () => {
  it.each(["organisation_admin", "manager"] as const)(
    "renders children for %s in an entitled org",
    async (role) => {
      signIn(ROLE_USERS[role]);
      await expect(render()).resolves.toBeTruthy();
    }
  );

  it("renders children for a platform owner", async () => {
    signIn("u-owner", ORG_C);
    await expect(render()).resolves.toBeTruthy();
  });

  it.each(["dispatcher", "supervisor", "driver", "employee", "company_manager"] as const)(
    "404s for %s even though the org is entitled",
    async (role) => {
      signIn(ROLE_USERS[role]);
      await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    }
  );

  it("404s for an admin of an org whose plan lacks maintenance", async () => {
    signIn("u-admin-c", ORG_C);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for an admin of an org with no subscription (no fail-open)", async () => {
    signIn("u-admin-d", ORG_D);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for an entitled admin once the subscription is cancelled", async () => {
    tables.subscriptions[0]!.status = "canceled";
    signIn(ROLE_USERS.organisation_admin);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for an admin pointing at an org they don't belong to", async () => {
    signIn("u-admin-c", ORG_A);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when there is no active organisation", async () => {
    signIn(ROLE_USERS.organisation_admin, null);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects to /login without a session", async () => {
    signIn(null);
    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("errors (not grants) when the service role is missing", async () => {
    serviceAvailable = false;
    signIn(ROLE_USERS.organisation_admin);
    await expect(render()).rejects.toThrow("temporarily unavailable");
  });
});

describe("assertMaintenanceAccess view vs manage", () => {
  it("checks maintenance:view for 'view' and maintenance:manage for 'manage'", async () => {
    const { maintenancePermissionFor } = await import("@/lib/auth/maintenance-access");
    expect(maintenancePermissionFor("view")).toBe("maintenance:view");
    expect(maintenancePermissionFor("manage")).toBe("maintenance:manage");
  });

  it("denies 'manage' to a role that only holds maintenance:view", async () => {
    vi.resetModules();
    vi.doMock("@/lib/permissions", async (orig) => {
      const real = await orig<typeof import("@/lib/permissions")>();
      return {
        ...real,
        hasPermission: (role: never, perm: string, owner?: boolean) =>
          role === "manager" && perm === "maintenance:manage"
            ? false
            : real.hasPermission(role, perm as never, owner),
      };
    });
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    const view = await assertMaintenanceAccess("view", { organisationId: ORG_A, userId: ROLE_USERS.manager });
    const manage = await assertMaintenanceAccess("manage", { organisationId: ORG_A, userId: ROLE_USERS.manager });
    expect(view.ok).toBe(true);
    expect(manage).toMatchObject({ ok: false, status: 403, error: "forbidden" });
    vi.doUnmock("@/lib/permissions");
    vi.resetModules();
  });
});
