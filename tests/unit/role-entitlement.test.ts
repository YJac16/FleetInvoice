/**
 * Step 6 (GoOps refocus) — which roles an admin may assign, per entitlement.
 * company_manager needs portal, employee needs passengers (ROLE_MODULE);
 * drivers and ops roles are always assignable.
 * Run: npm run test:role-entitlements
 */
import { describe, expect, it } from "vitest";

import { INVITABLE_ROLES } from "@/lib/constants";
import {
  ALL_MODULES,
  assignableRoles,
  FAIL_OPEN_MODULES,
  isRoleAllowedForModules,
  type AppModule,
} from "@/lib/entitlements";

const ALWAYS = ["organisation_admin", "manager", "dispatcher", "supervisor", "driver"];

describe("assignableRoles", () => {
  it("core-only plan hides company_manager and employee", () => {
    expect(assignableRoles(INVITABLE_ROLES, ["core"])).toEqual(ALWAYS);
  });

  it("fail-open fallback hides both (portal/passengers never fail open)", () => {
    expect(assignableRoles(INVITABLE_ROLES, FAIL_OPEN_MODULES)).toEqual(ALWAYS);
  });

  it("portal plan shows company_manager only", () => {
    const roles = assignableRoles(INVITABLE_ROLES, ["core", "portal"]);
    expect(roles).toContain("company_manager");
    expect(roles).not.toContain("employee");
  });

  it("passengers plan shows employee only", () => {
    const roles = assignableRoles(INVITABLE_ROLES, ["core", "passengers"]);
    expect(roles).toContain("employee");
    expect(roles).not.toContain("company_manager");
  });

  it("'all' and ALL_MODULES show every invitable role", () => {
    expect(assignableRoles(INVITABLE_ROLES, "all")).toEqual([...INVITABLE_ROLES]);
    expect(assignableRoles(INVITABLE_ROLES, ALL_MODULES)).toEqual([...INVITABLE_ROLES]);
  });

  it("drivers and ops roles are allowed with no modules at all", () => {
    const none: AppModule[] = [];
    for (const role of ALWAYS) {
      expect(isRoleAllowedForModules(role as (typeof INVITABLE_ROLES)[number], none)).toBe(true);
    }
  });
});
