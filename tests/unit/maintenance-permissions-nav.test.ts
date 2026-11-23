/**
 * U4 — maintenance permission matrix, module mapping and nav visibility.
 * Run: npm run test:maintenance-u4
 */
import { describe, expect, it } from "vitest";

import { MAINTENANCE_ROLES } from "@/lib/auth/maintenance-access";
import { APP_ROLES, type AppRole } from "@/lib/constants";
import {
  ALL_MODULES,
  APP_MODULES,
  FAIL_OPEN_MODULES,
  isAppModule,
  moduleForPermission,
  NEVER_FAIL_OPEN,
  type AppModule,
} from "@/lib/entitlements";
import { MAIN_NAV, isNavItemVisible } from "@/lib/navigation";
import { hasPermission, permissionsForRole } from "@/lib/permissions";
import { MODULE_LABELS } from "@/lib/plans";

const ALLOWED: readonly AppRole[] = ["platform_owner", "organisation_admin", "manager"];
const DENIED: readonly AppRole[] = [
  "dispatcher",
  "supervisor",
  "driver",
  "employee",
  "company_manager",
];

describe("maintenance permission matrix", () => {
  it("covers every app role exactly once", () => {
    expect([...ALLOWED, ...DENIED].sort()).toEqual([...APP_ROLES].sort());
  });

  for (const perm of ["maintenance:view", "maintenance:manage"] as const) {
    it.each(ALLOWED)(`grants ${perm} to %s`, (role) => {
      expect(hasPermission(role, perm)).toBe(true);
    });
    it.each(DENIED)(`denies ${perm} to %s`, (role) => {
      expect(hasPermission(role, perm)).toBe(false);
      expect(permissionsForRole(role)).not.toContain(perm);
    });
    it(`grants ${perm} to a platform owner flag regardless of org role`, () => {
      expect(hasPermission("driver", perm, true)).toBe(true);
      expect(hasPermission(null, perm, true)).toBe(true);
    });
    it(`denies ${perm} with no role`, () => {
      expect(hasPermission(null, perm)).toBe(false);
    });
  }

  it("MAINTENANCE_ROLES (DB writer roles) match the org roles holding maintenance:manage", () => {
    const orgRolesWithManage = APP_ROLES.filter(
      (r) => r !== "platform_owner" && hasPermission(r, "maintenance:manage")
    );
    expect([...orgRolesWithManage].sort()).toEqual([...MAINTENANCE_ROLES].sort());
  });
});

describe("maintenance entitlement wiring", () => {
  it("is an app module with a plan label", () => {
    expect(APP_MODULES).toContain("maintenance");
    expect(isAppModule("maintenance")).toBe(true);
    expect(MODULE_LABELS.maintenance).toBeTruthy();
  });

  it("maps maintenance:* to the maintenance module", () => {
    expect(moduleForPermission("maintenance:view")).toBe("maintenance");
    expect(moduleForPermission("maintenance:manage")).toBe("maintenance");
  });

  it("is never granted by the client fail-open fallback", () => {
    expect(ALL_MODULES).toContain("maintenance");
    expect(FAIL_OPEN_MODULES).not.toContain("maintenance");
    // Step 2 of the refocus widened the exclusion list (NEVER_FAIL_OPEN).
    expect(NEVER_FAIL_OPEN).toContain("maintenance");
    expect(FAIL_OPEN_MODULES).toEqual(ALL_MODULES.filter((m) => !NEVER_FAIL_OPEN.includes(m)));
  });
});

describe("maintenance nav item", () => {
  const nav = MAIN_NAV.find((i) => i.href === "/maintenance");
  const withMaint: AppModule[] = ["core", "maintenance"];
  const withoutMaint: AppModule[] = ["core", "billing", "gps"];

  it("exists under the fleet group, gated on maintenance:view + maintenance module", () => {
    expect(nav).toMatchObject({
      title: "Maintenance",
      group: "fleet",
      permission: "maintenance:view",
      module: "maintenance",
    });
  });

  it.each(["organisation_admin", "manager"] as const)(
    "shows for %s when the org is entitled",
    (role) => {
      expect(isNavItemVisible(nav!, { role, isPlatformOwner: false, entitledModules: withMaint })).toBe(true);
    }
  );

  it.each(["organisation_admin", "manager"] as const)(
    "hides for %s when the org is not entitled",
    (role) => {
      expect(isNavItemVisible(nav!, { role, isPlatformOwner: false, entitledModules: withoutMaint })).toBe(false);
    }
  );

  it.each(["organisation_admin", "manager"] as const)(
    "hides for %s under the client fail-open module set",
    (role) => {
      expect(
        isNavItemVisible(nav!, { role, isPlatformOwner: false, entitledModules: FAIL_OPEN_MODULES })
      ).toBe(false);
    }
  );

  it.each(DENIED)("hides for %s even when the org is entitled", (role) => {
    expect(isNavItemVisible(nav!, { role, isPlatformOwner: false, entitledModules: withMaint })).toBe(false);
    expect(isNavItemVisible(nav!, { role, isPlatformOwner: false, entitledModules: "all" })).toBe(false);
  });

  it("shows for a platform owner (bypasses the module check, like the server guard)", () => {
    expect(isNavItemVisible(nav!, { role: null, isPlatformOwner: true, entitledModules: withoutMaint })).toBe(true);
  });

  it("does not change visibility of existing fleet items", () => {
    const fuel = MAIN_NAV.find((i) => i.href === "/fuel")!;
    expect(isNavItemVisible(fuel, { role: "dispatcher", isPlatformOwner: false, entitledModules: FAIL_OPEN_MODULES })).toBe(true);
  });
});
