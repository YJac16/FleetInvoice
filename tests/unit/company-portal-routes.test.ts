import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { companyNavItems, COMPANY_NAV } from "@/features/company/lib/company-nav";
import { hubPathForRole } from "@/lib/auth/hub-redirect";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionContext: vi.fn(),
}));

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("company nav", () => {
  it("has Home, Invoices, and Reports and no Fuel or Fleet", () => {
    expect(COMPANY_NAV.map((item) => item.label)).toEqual([
      "Home",
      "Invoices",
      "Reports",
    ]);
    expect(COMPANY_NAV.map((item) => item.href)).not.toContain("/company/fuel");
    expect(COMPANY_NAV.map((item) => item.href)).not.toContain("/company/fleet");
    const visible = companyNavItems(() => true);
    expect(visible).toHaveLength(3);
  });
});

describe("company_manager route gate", () => {
  it("still lands on /company", () => {
    expect(hubPathForRole("company_manager")).toBe("/company");
  });

  it("dashboard layout does not admit company_manager", () => {
    const layout = readFileSync(
      join(root, "app/(dashboard)/layout.tsx"),
      "utf8"
    );
    expect(layout).toContain("requireRole");
    expect(layout).not.toContain("company_manager");
  });

  it("fuel and fleet company routes redirect to /company", () => {
    for (const page of [
      "app/(company)/company/fuel/page.tsx",
      "app/(company)/company/fleet/page.tsx",
    ]) {
      const source = readFileSync(join(root, page), "utf8");
      expect(source).toContain('redirect("/company")');
      expect(source).not.toContain("FuelFillupsPage");
      expect(source).not.toContain("VehiclesPage");
    }
  });

  it("requireRole sends a company_manager session to /company", async () => {
    const { getSessionContext } = await import("@/lib/auth/session");
    const { requireRole } = await import("@/lib/auth/require-permission");
    vi.mocked(getSessionContext).mockResolvedValue({
      userId: "user",
      email: "company@example.com",
      profile: { id: "user" } as never,
      memberships: [{} as never],
      activeOrganisationId: "org",
      activeRole: "company_manager",
      isPlatformOwner: false,
    });

    await expect(
      requireRole(
        "organisation_admin",
        "manager",
        "dispatcher",
        "supervisor",
        "platform_owner"
      )
    ).rejects.toThrow("REDIRECT /company");
  });
});
