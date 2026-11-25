/**
 * Demo QA6 — finance nav and page guards by role.
 * Supervisor and dispatcher see none of Invoices / Rate cards / Route prices /
 * Pay rates / Payroll. Layouts 404 the same roles even when the org is entitled (lib/auth/module-guard.ts guardModulePage).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/constants";
import { visibleReportKinds } from "@/features/reports/lib/report-kinds";
import { REPORT_TYPES } from "@/features/reports/schemas/report";
import { MAIN_NAV, isNavItemVisible } from "@/lib/navigation";
import { hasPermission } from "@/lib/permissions";

const FINANCE = ["/invoices", "/rate-cards", "/route-prices", "/pay-rates", "/payroll"] as const;
type FinanceRoute = (typeof FINANCE)[number];

function visibleFinance(role: AppRole): string[] {
  return MAIN_NAV.filter((i) => (FINANCE as readonly string[]).includes(i.href))
    .filter((i) => isNavItemVisible(i, { role, isPlatformOwner: false, entitledModules: "all" }))
    .map((i) => i.href);
}

describe("finance nav visibility", () => {
  it("all five finance links are in MAIN_NAV", () => {
    expect(MAIN_NAV.map((i) => i.href)).toEqual(expect.arrayContaining([...FINANCE]));
  });

  it.each(["organisation_admin", "manager"] as const)("%s sees all five", (role) => {
    expect(visibleFinance(role).sort()).toEqual([...FINANCE].sort());
  });

  it("platform owner sees all five", () => {
    const shown = MAIN_NAV.filter((i) => (FINANCE as readonly string[]).includes(i.href)).filter((i) =>
      isNavItemVisible(i, { role: null, isPlatformOwner: true, entitledModules: [] })
    );
    expect(shown).toHaveLength(5);
  });

  it("supervisor sees none of the five", () => {
    expect(visibleFinance("supervisor")).toEqual([]);
  });

  it("dispatcher sees none of the five", () => {
    expect(visibleFinance("dispatcher")).toEqual([]);
  });

  it.each(["dispatcher", "supervisor"] as const)("%s has no finance view or manage permission", (role) => {
    for (const p of [
      "invoices:view",
      "invoices:manage",
      "rate_cards:view",
      "rate_cards:manage",
      "payroll:view",
      "payroll:manage",
    ] as const) {
      expect(hasPermission(role, p)).toBe(false);
    }
  });

  it("company_manager keeps invoices:view; supervisor keeps reports:view", () => {
    expect(hasPermission("company_manager", "invoices:view")).toBe(true);
    expect(hasPermission("supervisor", "reports:view")).toBe(true);
    expect(hasPermission("supervisor", "invoices:view")).toBe(false);
  });
});

describe("report kinds by role", () => {
  const kindsFor = (role: AppRole) =>
    visibleReportKinds(REPORT_TYPES, (p) => hasPermission(role, p));

  it("supervisor loses the commercial (Invoices & payroll) report", () => {
    expect(kindsFor("supervisor").kinds).not.toContain("commercial");
    expect(kindsFor("supervisor").kinds).toEqual(["trips", "fuel", "attendance"]);
  });

  it("dispatcher loses the commercial report and payroll", () => {
    expect(kindsFor("dispatcher")).toEqual({ kinds: ["trips", "fuel", "attendance"], hidePayroll: true });
  });

  it("manager sees everything including payroll", () => {
    expect(kindsFor("manager")).toEqual({ kinds: [...REPORT_TYPES], hidePayroll: false });
  });

  it("an explicit hidePayroll prop is kept (company portal)", () => {
    const r = visibleReportKinds(["trips", "commercial"], (p) => hasPermission("company_manager", p), true);
    expect(r).toEqual({ kinds: ["trips", "commercial"], hidePayroll: true });
  });
});

let currentSession: Record<string, unknown> | null = null;
const assertAnyModuleAccess = vi.fn(async () => ({ ok: true as const }));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn(async () => currentSession) }));
vi.mock("@/lib/auth/module-access", () => ({ assertAnyModuleAccess }));

type Layout = (props: { children: React.ReactNode }) => Promise<unknown>;
const LOAD: Record<FinanceRoute, () => Promise<{ default: Layout }>> = {
  "/invoices": () => import("@/app/(dashboard)/invoices/layout"),
  "/rate-cards": () => import("@/app/(dashboard)/rate-cards/layout"),
  "/route-prices": () => import("@/app/(dashboard)/route-prices/layout"),
  "/pay-rates": () => import("@/app/(dashboard)/pay-rates/layout"),
  "/payroll": () => import("@/app/(dashboard)/payroll/layout"),
};
const render = async (route: FinanceRoute) => (await LOAD[route]()).default({ children: "page" });

function signIn(role: AppRole | null, isPlatformOwner = false) {
  currentSession = {
    userId: "u-1",
    activeOrganisationId: "a0000000-0000-4000-8000-000000000001",
    activeRole: role,
    isPlatformOwner,
    profile: {},
    memberships: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession = null;
});

describe("finance layout guards (org entitled)", () => {
  it.each(FINANCE)("supervisor gets 404 on %s", async (route) => {
    signIn("supervisor");
    await expect(render(route)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(FINANCE)("dispatcher gets 404 on %s", async (route) => {
    signIn("dispatcher");
    await expect(render(route)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(FINANCE)("manager renders %s", async (route) => {
    signIn("manager");
    await expect(render(route)).resolves.toBeTruthy();
  });

  it.each(FINANCE)("platform owner renders %s", async (route) => {
    signIn(null, true);
    await expect(render(route)).resolves.toBeTruthy();
  });

  it("module check still runs first (not entitled -> /app/no-access, even for supervisor)", async () => {
    assertAnyModuleAccess.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "module_not_entitled",
    } as never);
    signIn("supervisor");
    await expect(render("/invoices")).rejects.toThrow("NEXT_REDIRECT:/app/no-access");
  });
});
