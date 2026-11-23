/**
 * Generic server-side module guard (lib/auth/module-access.ts).
 * Matrix: role x entitlement state x platform owner x fail-open, for a
 * fail-open-eligible module (billing) and every NEVER_FAIL_OPEN module.
 * The service client is faked with an in-memory table store.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_ROLES, type AppRole } from "@/lib/constants";
import {
  ALL_MODULES,
  FAIL_OPEN_MODULES,
  NEVER_FAIL_OPEN,
  ROLE_MODULE,
  type AppModule,
} from "@/lib/entitlements";
import { hasPermission, type Permission } from "@/lib/permissions";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const failTable: { name: string | null } = { name: null };

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let max = Infinity;
  const run = () =>
    failTable.name === table
      ? { data: null, error: new Error(`boom:${table}`) }
      : {
          data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, max),
          error: null,
        };
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), b),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b),
    limit: (n: number) => ((max = n), b),
    maybeSingle: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

let serviceAvailable = true;
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => (serviceAvailable ? { from: (t: string) => query(t) } : null)),
}));

/** Org fixtures, by entitlement state. */
const ORGS = {
  /** Active plan listing every module under test. */
  planWith: "a0000000-0000-4000-8000-000000000001",
  /** Active plan listing only core. */
  planWithout: "b0000000-0000-4000-8000-000000000001",
  /** No subscription at all -> fail-open. */
  noSubscription: "c0000000-0000-4000-8000-000000000001",
  /** Active subscription to a plan with zero entitlement rows -> fail-open. */
  emptyPlan: "d0000000-0000-4000-8000-000000000001",
  /** Only a cancelled subscription to the full plan -> fail-open. */
  cancelled: "e0000000-0000-4000-8000-000000000001",
} as const;
type OrgState = keyof typeof ORGS;
const FAIL_OPEN_STATES: readonly OrgState[] = ["noSubscription", "emptyPlan", "cancelled"];

const MODULES_UNDER_TEST: ReadonlyArray<{ module: AppModule; permission?: Permission }> = [
  { module: "billing", permission: "invoices:view" },
  { module: "maintenance", permission: "maintenance:view" },
  { module: "portal" },
  { module: "passengers" },
];

const MEMBER_ROLES = APP_ROLES.filter((r) => r !== "platform_owner");
const userFor = (role: AppRole, state: OrgState) => `u-${role}-${state}`;

function seed() {
  const states = Object.keys(ORGS) as OrgState[];
  tables.profiles = [
    { id: "u-owner", is_platform_owner: true },
    { id: "u-outsider", is_platform_owner: false },
    ...states.flatMap((s) =>
      MEMBER_ROLES.map((role) => ({ id: userFor(role, s), is_platform_owner: false }))
    ),
  ];
  tables.organisation_members = [
    ...states.flatMap((s) =>
      MEMBER_ROLES.map((role) => ({
        organisation_id: ORGS[s],
        user_id: userFor(role, s),
        role,
        status: "active",
      }))
    ),
    // Suspended membership must not count.
    {
      organisation_id: ORGS.planWith,
      user_id: "u-outsider",
      role: "organisation_admin",
      status: "suspended",
    },
  ];
  tables.subscriptions = [
    { organisation_id: ORGS.planWith, plan_id: "p-full", status: "active" },
    { organisation_id: ORGS.planWithout, plan_id: "p-core", status: "trialing" },
    { organisation_id: ORGS.emptyPlan, plan_id: "p-empty", status: "active" },
    { organisation_id: ORGS.cancelled, plan_id: "p-full", status: "canceled" },
  ];
  tables.module_entitlements = [
    ...["core", "billing", "maintenance", "portal", "passengers"].map((module_key) => ({
      plan_id: "p-full",
      module_key,
    })),
    { plan_id: "p-core", module_key: "core" },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  serviceAvailable = true;
  failTable.name = null;
});

async function guard() {
  return import("@/lib/auth/module-access");
}

describe("entitlement constants", () => {
  it("NEVER_FAIL_OPEN is exactly maintenance, portal, passengers", () => {
    expect([...NEVER_FAIL_OPEN].sort()).toEqual(["maintenance", "passengers", "portal"]);
  });

  it("FAIL_OPEN_MODULES is every module except NEVER_FAIL_OPEN", () => {
    for (const m of NEVER_FAIL_OPEN) expect(FAIL_OPEN_MODULES).not.toContain(m);
    expect(FAIL_OPEN_MODULES.length + NEVER_FAIL_OPEN.length).toBe(ALL_MODULES.length);
  });

  it("passengers is a known module key", () => {
    expect(ALL_MODULES).toContain("passengers");
  });

  it("ROLE_MODULE maps the two hidden hubs and nothing else", () => {
    expect(ROLE_MODULE).toEqual({ company_manager: "portal", employee: "passengers" });
  });
});

describe("assertModuleAccess matrix", () => {
  const states = Object.keys(ORGS) as OrgState[];

  for (const { module, permission } of MODULES_UNDER_TEST) {
    describe(`${module}${permission ? ` (${permission})` : ""}`, () => {
      const cases = states.flatMap((state) =>
        MEMBER_ROLES.map((role) => [role, state] as const)
      );

      it.each(cases)("%s in %s org", async (role, state) => {
        const { assertModuleAccess } = await guard();
        const result = await assertModuleAccess(module, {
          organisationId: ORGS[state],
          userId: userFor(role, state),
          permission,
        });

        const holdsPermission = !permission || hasPermission(role, permission);
        const entitled =
          state === "planWith" ||
          (FAIL_OPEN_STATES.includes(state) && !NEVER_FAIL_OPEN.includes(module));

        if (!holdsPermission) {
          expect(result).toMatchObject({ ok: false, status: 403, error: "forbidden", notMember: false });
        } else if (!entitled) {
          expect(result).toMatchObject({ ok: false, status: 403, error: "module_not_entitled" });
        } else {
          expect(result).toMatchObject({
            ok: true,
            module,
            organisationId: ORGS[state],
            isPlatformOwner: false,
          });
        }
      });

      it.each(states)("platform owner bypasses entitlement in %s org", async (state) => {
        const { assertModuleAccess } = await guard();
        const result = await assertModuleAccess(module, {
          organisationId: ORGS[state],
          userId: "u-owner",
          permission,
        });
        expect(result).toMatchObject({ ok: true, isPlatformOwner: true, module });
      });

      it("non-member is forbidden with notMember, even with a suspended row", async () => {
        const { assertModuleAccess } = await guard();
        const result = await assertModuleAccess(module, {
          organisationId: ORGS.planWith,
          userId: "u-outsider",
          permission,
        });
        expect(result).toEqual({ ok: false, status: 403, error: "forbidden", notMember: true });
      });
    });
  }
});

describe("assertModuleAccess edge cases", () => {
  it("401 when no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { assertModuleAccess } = await guard();
    await expect(assertModuleAccess("billing", { organisationId: ORGS.planWith })).resolves.toEqual({
      ok: false,
      status: 401,
      error: "unauthenticated",
      notMember: false,
    });
  });

  it("resolves the user from the session when userId is undefined", async () => {
    getUser.mockResolvedValue({ data: { user: { id: userFor("manager", "planWith") } } });
    const { assertModuleAccess } = await guard();
    const result = await assertModuleAccess("billing", { organisationId: ORGS.planWith });
    expect(result).toMatchObject({ ok: true, userId: userFor("manager", "planWith") });
  });

  it("401 when userId is explicitly null, without reading the session", async () => {
    const { assertModuleAccess } = await guard();
    const result = await assertModuleAccess("billing", { organisationId: ORGS.planWith, userId: null });
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("503 when the service client is unavailable", async () => {
    serviceAvailable = false;
    const { assertModuleAccess } = await guard();
    await expect(
      assertModuleAccess("billing", { organisationId: ORGS.planWith, userId: "u-owner" })
    ).resolves.toMatchObject({ ok: false, status: 503, error: "service_unavailable" });
  });

  it.each(["subscriptions", "module_entitlements", "organisation_members", "profiles"])(
    "throws (never grants) when %s can't be read",
    async (table) => {
      failTable.name = table;
      const { assertModuleAccess } = await guard();
      await expect(
        assertModuleAccess("billing", {
          organisationId: ORGS.planWith,
          userId: userFor("manager", "planWith"),
        })
      ).rejects.toThrow(`boom:${table}`);
    }
  );

  it("ignores unknown module keys and does not fail open because of them", async () => {
    tables.module_entitlements.push({ plan_id: "p-empty", module_key: "future_thing" });
    const { orgEntitledModules } = await guard();
    const admin = { from: (t: string) => query(t) } as never;
    await expect(orgEntitledModules(admin, ORGS.emptyPlan)).resolves.toEqual([]);
  });

  it("orgEntitledModules unions keys across active subscriptions", async () => {
    tables.subscriptions.push({ organisation_id: ORGS.planWithout, plan_id: "p-full", status: "active" });
    const { orgEntitledModules } = await guard();
    const admin = { from: (t: string) => query(t) } as never;
    const modules = await orgEntitledModules(admin, ORGS.planWithout);
    expect([...modules].sort()).toEqual(["billing", "core", "maintenance", "passengers", "portal"]);
  });

  it("orgEntitledModules fails open without NEVER_FAIL_OPEN modules", async () => {
    const { orgEntitledModules } = await guard();
    const admin = { from: (t: string) => query(t) } as never;
    await expect(orgEntitledModules(admin, ORGS.noSubscription)).resolves.toEqual(FAIL_OPEN_MODULES);
  });
});

describe("maintenance wrapper keeps its contract", () => {
  it("returns mode and no module key on success", async () => {
    const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
    const result = await assertMaintenanceAccess("manage", {
      organisationId: ORGS.planWith,
      userId: userFor("organisation_admin", "planWith"),
    });
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ mode: "manage" });
    expect(result).not.toHaveProperty("module");
  });

  it.each(Object.keys(ORGS) as OrgState[])(
    "agrees with assertModuleAccess for every role in %s org",
    async (state) => {
      const { assertMaintenanceAccess } = await import("@/lib/auth/maintenance-access");
      const { assertModuleAccess } = await guard();
      for (const role of MEMBER_ROLES) {
        for (const mode of ["view", "manage"] as const) {
          const input = { organisationId: ORGS[state], userId: userFor(role, state) };
          const wrapped = await assertMaintenanceAccess(mode, input);
          const generic = await assertModuleAccess("maintenance", {
            ...input,
            permission: mode === "manage" ? "maintenance:manage" : "maintenance:view",
          });
          expect(wrapped.ok).toBe(generic.ok);
          if (!wrapped.ok && !generic.ok) expect(wrapped).toEqual(generic);
        }
      }
    }
  );
});
