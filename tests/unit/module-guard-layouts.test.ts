/**
 * Step 4 (GoOps refocus) — server module guards on layouts
 * (lib/auth/module-guard.ts guardModulePage). Session, Next navigation, the
 * service client and the hub shells are faked.
 * Step 5: a member whose org isn't entitled goes to /app/no-access; 404 stays
 * for non-members and for no active org.
 * Run: npm run test:module-guards
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FAIL_OPEN_MODULES, type AppModule } from "@/lib/entitlements";

const ORG = {
  /** Plan listing every module. */
  full: "a0000000-0000-4000-8000-000000000001",
  /** Plan listing only core. */
  core: "b0000000-0000-4000-8000-000000000001",
  /** No subscription -> FAIL_OPEN_MODULES. */
  none: "c0000000-0000-4000-8000-000000000001",
  /** Plan listing core + passengers. */
  pass: "d0000000-0000-4000-8000-000000000001",
  /** Plan listing core + attendance. */
  att: "e0000000-0000-4000-8000-000000000001",
} as const;
type OrgKey = keyof typeof ORG;
const ORG_KEYS = Object.keys(ORG) as OrgKey[];
const NO_ACCESS = "NEXT_REDIRECT:/app/no-access";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function seed() {
  tables.profiles = [
    { id: "u-owner", is_platform_owner: true },
    ...ORG_KEYS.flatMap((k) =>
      ["admin", "cm", "emp"].map((r) => ({ id: `u-${r}-${k}`, is_platform_owner: false }))
    ),
  ];
  tables.organisation_members = ORG_KEYS.flatMap((k) => [
    { organisation_id: ORG[k], user_id: `u-admin-${k}`, role: "organisation_admin", status: "active" },
    { organisation_id: ORG[k], user_id: `u-cm-${k}`, role: "company_manager", status: "active" },
    { organisation_id: ORG[k], user_id: `u-emp-${k}`, role: "employee", status: "active" },
  ]);
  tables.subscriptions = [
    { organisation_id: ORG.full, plan_id: "p-full", status: "active" },
    { organisation_id: ORG.core, plan_id: "p-core", status: "active" },
    { organisation_id: ORG.pass, plan_id: "p-pass", status: "active" },
    { organisation_id: ORG.att, plan_id: "p-att", status: "trialing" },
  ];
  tables.module_entitlements = [
    ...["core", "gps", "attendance", "billing", "payroll", "reports", "portal", "maintenance", "passengers"].map(
      (module_key) => ({ plan_id: "p-full", module_key })
    ),
    { plan_id: "p-core", module_key: "core" },
    { plan_id: "p-pass", module_key: "core" },
    { plan_id: "p-pass", module_key: "passengers" },
    { plan_id: "p-att", module_key: "core" },
    { plan_id: "p-att", module_key: "attendance" },
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

let serviceAvailable = true;
let currentSession: Record<string, unknown> | null = null;
const getSessionContext = vi.fn(async () => currentSession);
const requireRole = vi.fn(async () => {
  if (!currentSession) throw new Error("NEXT_REDIRECT:/login");
  return currentSession;
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/auth/require-permission", () => ({ requireRole }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: vi.fn(() => (serviceAvailable ? { from: (t: string) => query(t) } : null)),
}));
vi.mock("@/components/layout/company-shell", () => ({ CompanyShell: () => null }));
vi.mock("@/components/layout/employee-shell", () => ({ EmployeeShell: () => null }));

type Layout = (props: { children: React.ReactNode }) => Promise<unknown>;
type LayoutCase = {
  route: string;
  modules: readonly AppModule[];
  /** Member used for the "regular user" cases (hubs need the hub's role). */
  user: "admin" | "cm" | "emp";
  load: () => Promise<{ default: Layout }>;
};

const LAYOUTS: LayoutCase[] = [
  { route: "/invoices", modules: ["billing"], user: "admin", load: () => import("@/app/(dashboard)/invoices/layout") },
  { route: "/rate-cards", modules: ["billing"], user: "admin", load: () => import("@/app/(dashboard)/rate-cards/layout") },
  { route: "/route-prices", modules: ["billing"], user: "admin", load: () => import("@/app/(dashboard)/route-prices/layout") },
  { route: "/payroll", modules: ["payroll"], user: "admin", load: () => import("@/app/(dashboard)/payroll/layout") },
  { route: "/pay-rates", modules: ["payroll"], user: "admin", load: () => import("@/app/(dashboard)/pay-rates/layout") },
  { route: "/attendance", modules: ["attendance"], user: "admin", load: () => import("@/app/(dashboard)/attendance/layout") },
  { route: "/reports", modules: ["reports"], user: "admin", load: () => import("@/app/(dashboard)/reports/layout") },
  { route: "/dispatch", modules: ["gps"], user: "admin", load: () => import("@/app/(dashboard)/dispatch/layout") },
  { route: "/geofences", modules: ["gps"], user: "admin", load: () => import("@/app/(dashboard)/geofences/layout") },
  {
    route: "/employees",
    modules: ["passengers", "attendance"],
    user: "admin",
    load: () => import("@/app/(dashboard)/employees/layout"),
  },
  { route: "/company/*", modules: ["portal"], user: "cm", load: () => import("@/app/(company)/layout") },
  { route: "/employee/*", modules: ["passengers"], user: "emp", load: () => import("@/app/(employee)/layout") },
];

/** Which orgs each module set should let through (per the seeded plans). */
function entitledIn(org: OrgKey, modules: readonly AppModule[]): boolean {
  if (org === "full") return true;
  if (org === "none") return modules.some((m) => FAIL_OPEN_MODULES.includes(m));
  const extra: Record<OrgKey, AppModule[]> = { full: [], none: [], core: [], pass: ["passengers"], att: ["attendance"] };
  return modules.some((m) => extra[org].includes(m));
}

function signIn(userId: string | null, organisationId: string | null) {
  currentSession = userId
    ? {
        userId,
        activeOrganisationId: organisationId,
        activeRole:
          (tables.organisation_members ?? []).find(
            (m) => m.user_id === userId && m.organisation_id === organisationId
          )?.role ?? null,
        isPlatformOwner: userId === "u-owner",
        profile: {},
        memberships: [],
      }
    : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  serviceAvailable = true;
  currentSession = null;
});

describe.each(LAYOUTS)("$route layout guard ($modules)", ({ modules, user, load }) => {
  const render = async () => (await load()).default({ children: "page" });

  it.each(ORG_KEYS)("member of %s org: renders when entitled, else /app/no-access", async (org) => {
    signIn(`u-${user}-${org}`, ORG[org]);
    if (entitledIn(org, modules)) {
      await expect(render()).resolves.toBeTruthy();
    } else {
      await expect(render()).rejects.toThrow(NO_ACCESS);
    }
  });

  it("platform owner bypasses the entitlement (core-only org)", async () => {
    signIn("u-owner", ORG.core);
    await expect(render()).resolves.toBeTruthy();
  });

  it("platform owner with no active org gets 404", async () => {
    signIn("u-owner", null);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for a user pointing at an org they don't belong to", async () => {
    signIn(`u-${user}-core`, ORG.full);
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("goes to /app/no-access once the entitling subscription is cancelled", async () => {
    tables.subscriptions[0]!.status = "canceled"; // full -> fail-open
    signIn(`u-${user}-full`, ORG.full);
    if (modules.some((m) => FAIL_OPEN_MODULES.includes(m))) {
      await expect(render()).resolves.toBeTruthy();
    } else {
      await expect(render()).rejects.toThrow(NO_ACCESS);
    }
  });

  it("redirects to /login without a session", async () => {
    signIn(null, null);
    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("redirects to /app/unavailable (not grants, not 500) when the service role is missing", async () => {
    serviceAvailable = false;
    signIn(`u-${user}-full`, ORG.full);
    await expect(render()).rejects.toThrow("NEXT_REDIRECT:/app/unavailable");
  });
});

describe("explicit expectations", () => {
  const layout = (route: string) => LAYOUTS.find((l) => l.route === route)!;
  const render = async (route: string) => (await layout(route).load()).default({ children: "page" });

  it("/employees: passengers-only and attendance-only orgs both pass; core-only goes to /app/no-access", async () => {
    signIn("u-admin-pass", ORG.pass);
    await expect(render("/employees")).resolves.toBeTruthy();
    signIn("u-admin-att", ORG.att);
    await expect(render("/employees")).resolves.toBeTruthy();
    signIn("u-admin-core", ORG.core);
    await expect(render("/employees")).rejects.toThrow(NO_ACCESS);
  });

  it("/employees is open under fail-open (attendance), by design", async () => {
    signIn("u-admin-none", ORG.none);
    await expect(render("/employees")).resolves.toBeTruthy();
  });

  it.each(["/company/*", "/employee/*"])("%s never fails open", async (route) => {
    signIn(`u-${layout(route).user}-none`, ORG.none);
    await expect(render(route)).rejects.toThrow(NO_ACCESS);
  });

  it.each(["/invoices", "/payroll", "/attendance", "/reports", "/dispatch"])(
    "%s is open under fail-open",
    async (route) => {
      signIn("u-admin-none", ORG.none);
      await expect(render(route)).resolves.toBeTruthy();
    }
  );

  it("hub layouts reuse the session from requireRole", async () => {
    signIn("u-cm-full", ORG.full);
    await render("/company/*");
    expect(requireRole).toHaveBeenCalledWith("company_manager");
    expect(getSessionContext).not.toHaveBeenCalled();
  });
});
