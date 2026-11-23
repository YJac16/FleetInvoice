/**
 * Step 5 (GoOps refocus) — post-login /hub redirect and the /app/no-access
 * page for company managers (portal) and employees (passengers) whose org's
 * plan lacks their hub. Session, Next navigation and the service client are
 * faked. Run: npm run test:module-guards
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = {
  /** Plan listing portal + passengers. */
  full: "a0000000-0000-4000-8000-000000000001",
  /** Plan listing only core. */
  core: "b0000000-0000-4000-8000-000000000001",
  /** No subscription -> fail-open (never includes portal/passengers). */
  none: "c0000000-0000-4000-8000-000000000001",
} as const;
type OrgKey = keyof typeof ORG;
type Role = "company_manager" | "employee" | "driver" | "organisation_admin";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function seed() {
  const roles: Role[] = ["company_manager", "employee", "driver", "organisation_admin"];
  const orgs = Object.keys(ORG) as OrgKey[];
  tables.profiles = [
    { id: "u-owner", is_platform_owner: true },
    ...orgs.flatMap((o) => roles.map((r) => ({ id: `u-${r}-${o}`, is_platform_owner: false }))),
  ];
  tables.organisation_members = orgs.flatMap((o) =>
    roles.map((role) => ({ organisation_id: ORG[o], user_id: `u-${role}-${o}`, role, status: "active" }))
  );
  tables.subscriptions = [
    { organisation_id: ORG.full, plan_id: "p-full", status: "active" },
    { organisation_id: ORG.core, plan_id: "p-core", status: "active" },
  ];
  tables.module_entitlements = [
    { plan_id: "p-full", module_key: "core" },
    { plan_id: "p-full", module_key: "portal" },
    { plan_id: "p-full", module_key: "passengers" },
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

let serviceAvailable = true;
let currentSession: Record<string, unknown> | null = null;
const createServiceClient = vi.fn(() =>
  serviceAvailable ? { from: (t: string) => query(t) } : null
);

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn(async () => currentSession) }));
vi.mock("@/lib/auth/require-permission", () => ({
  requireSession: vi.fn(async () => {
    if (!currentSession) throw new Error("NEXT_REDIRECT:/login");
    return currentSession;
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createServiceClient }));
vi.mock("@/services/auth.service", () => ({ signOut: vi.fn() }));

function signIn(role: Role | "owner" | null, org: OrgKey | null = "core", memberOf: OrgKey | null = org) {
  if (!role) {
    currentSession = null;
    return;
  }
  const isPlatformOwner = role === "owner";
  currentSession = {
    userId: isPlatformOwner ? "u-owner" : `u-${role}-${memberOf}`,
    email: "user@example.test",
    activeOrganisationId: org ? ORG[org] : null,
    activeRole: isPlatformOwner ? null : role,
    isPlatformOwner,
    profile: {},
    memberships: org
      ? [{ organisation_id: ORG[org], role, organisations: { id: ORG[org], name: `Org ${org}` } }]
      : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
  serviceAvailable = true;
  currentSession = null;
});

describe("/hub post-login redirect", () => {
  const hub = async () => (await import("@/app/hub/page")).default();

  it.each([
    ["company_manager", "full", "/company"],
    ["company_manager", "core", "/app/no-access"],
    ["company_manager", "none", "/app/no-access"],
    ["employee", "full", "/employee"],
    ["employee", "core", "/app/no-access"],
    ["employee", "none", "/app/no-access"],
  ] as const)("%s in %s org -> %s", async (role, org, to) => {
    signIn(role, org);
    await expect(hub()).rejects.toThrow(`NEXT_REDIRECT:${to}`);
  });

  it("drivers go to /driver without an entitlement query", async () => {
    signIn("driver", "core");
    await expect(hub()).rejects.toThrow("NEXT_REDIRECT:/driver");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("ops roles go to /dashboard without an entitlement query", async () => {
    signIn("organisation_admin", "core");
    await expect(hub()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("platform owners go to /dashboard", async () => {
    signIn("owner", "core");
    await expect(hub()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("a non-member falls through to the hub (the layout 404s)", async () => {
    signIn("company_manager", "full", "core");
    await expect(hub()).rejects.toThrow("NEXT_REDIRECT:/company");
  });

  it("a missing service role falls through to the hub (the layout errors)", async () => {
    serviceAvailable = false;
    signIn("company_manager", "core");
    await expect(hub()).rejects.toThrow("NEXT_REDIRECT:/company");
  });

  it("no memberships -> /awaiting-invite; signed out -> /login", async () => {
    signIn("company_manager", null);
    await expect(hub()).rejects.toThrow("NEXT_REDIRECT:/awaiting-invite");
    signIn(null);
    await expect(hub()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

describe("/app/no-access page", () => {
  const page = async () => (await import("@/app/app/no-access/page")).default();

  /** Collect every href and text in the rendered element tree. */
  function walk(node: unknown, out: { hrefs: string[]; text: string[] }) {
    if (node == null || typeof node === "boolean") return out;
    if (typeof node === "string" || typeof node === "number") {
      out.text.push(String(node));
      return out;
    }
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, out));
      return out;
    }
    const props = (node as { props?: Record<string, unknown> }).props ?? {};
    if (typeof props.href === "string") out.hrefs.push(props.href);
    walk(props.render, out);
    walk(props.children, out);
    return out;
  }
  const rendered = async () => walk(await page(), { hrefs: [], text: [] });

  it("redirects to /login without a session", async () => {
    signIn(null);
    await expect(page()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it.each(["company_manager", "employee"] as const)(
    "%s with a denied hub gets no home link (no loop back)",
    async (role) => {
      signIn(role, "core");
      const { hrefs, text } = await rendered();
      expect(hrefs).toEqual([]);
      expect(text.join("")).toContain("Org core");
    }
  );

  it("an ops user denied a dashboard module is linked back to /dashboard", async () => {
    signIn("organisation_admin", "core");
    expect((await rendered()).hrefs).toEqual(["/dashboard"]);
  });

  it("a company manager whose hub is entitled is linked to /company", async () => {
    signIn("company_manager", "full");
    expect((await rendered()).hrefs).toEqual(["/company"]);
  });
});
