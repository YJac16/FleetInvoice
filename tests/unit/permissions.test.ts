import { describe, expect, it } from "vitest";

import {
  hasPermission,
  permissionsForRole,
} from "@/lib/permissions";

describe("permissions", () => {
  it("gives platform owner organisation manage", () => {
    expect(hasPermission("platform_owner", "organisations:manage")).toBe(true);
  });

  it("denies organisation_admin organisation manage", () => {
    expect(hasPermission("organisation_admin", "organisations:manage")).toBe(
      false
    );
  });

  it("allows supervisor attendance manage but not users manage", () => {
    expect(hasPermission("supervisor", "attendance:manage")).toBe(true);
    expect(hasPermission("supervisor", "users:manage")).toBe(false);
  });

  it("scopes company_manager to view-only company data", () => {
    const permissions = permissionsForRole("company_manager");
    expect(permissions).toContain("companies:view");
    expect(permissions).toContain("employees:view");
    expect(permissions).not.toContain("companies:manage");
    expect(permissions).not.toContain("users:manage");
  });

  it("gives dispatcher full trip and schedule management", () => {
    expect(hasPermission("dispatcher", "routes:view")).toBe(true);
    expect(hasPermission("dispatcher", "routes:manage")).toBe(true);
    expect(hasPermission("dispatcher", "schedules:view")).toBe(true);
    expect(hasPermission("dispatcher", "schedules:manage")).toBe(true);
    expect(hasPermission("dispatcher", "trips:view")).toBe(true);
    expect(hasPermission("dispatcher", "trips:manage")).toBe(true);
  });

  it("scopes company_manager to view-only trip data", () => {
    const permissions = permissionsForRole("company_manager");
    expect(permissions).toContain("routes:view");
    expect(permissions).toContain("schedules:view");
    expect(permissions).toContain("trips:view");
    expect(permissions).not.toContain("routes:manage");
    expect(permissions).not.toContain("schedules:manage");
    expect(permissions).not.toContain("trips:manage");
  });

  it("treats isPlatformOwner as full platform access", () => {
    expect(hasPermission("employee", "organisations:manage", true)).toBe(true);
  });

  it("limits employee to portal self permissions", () => {
    expect(permissionsForRole("employee")).toEqual([
      "dashboard:view",
      "profile:view",
      "trips:self",
      "attendance:self",
    ]);
  });

  it("gives driver trips:self, fuel:self, attendance manage, and gps:publish", () => {
    expect(permissionsForRole("driver")).toEqual([
      "dashboard:view",
      "profile:view",
      "trips:self",
      "fuel:self",
      "attendance:manage",
      "gps:publish",
    ]);
    expect(hasPermission("driver", "trips:self")).toBe(true);
    expect(hasPermission("driver", "fuel:self")).toBe(true);
    expect(hasPermission("driver", "attendance:manage")).toBe(true);
    expect(hasPermission("driver", "gps:publish")).toBe(true);
    expect(hasPermission("driver", "trips:manage")).toBe(false);
    expect(hasPermission("driver", "trips:view")).toBe(false);
  });

  it("gives dispatcher dispatch and gps view", () => {
    expect(hasPermission("dispatcher", "dispatch:view")).toBe(true);
    expect(hasPermission("dispatcher", "gps:view")).toBe(true);
    expect(hasPermission("dispatcher", "geofences:manage")).toBe(true);
  });

  it("gives company_manager invoice generate, scoped approved fuel view, fleet view, and attendance manage", () => {
    expect(hasPermission("company_manager", "invoices:view")).toBe(true);
    expect(hasPermission("company_manager", "invoices:manage")).toBe(true);
    expect(hasPermission("company_manager", "fuel:view_approved_scoped")).toBe(true);
    expect(hasPermission("company_manager", "fuel:view")).toBe(false);
    expect(hasPermission("company_manager", "fuel:photo_view")).toBe(false);
    expect(hasPermission("company_manager", "fuel:review")).toBe(false);
    expect(hasPermission("company_manager", "fuel:manage")).toBe(false);
    expect(hasPermission("company_manager", "vehicles:view")).toBe(true);
    expect(hasPermission("company_manager", "drivers:view")).toBe(true);
    expect(hasPermission("company_manager", "vehicles:manage")).toBe(false);
    expect(hasPermission("company_manager", "attendance:manage")).toBe(true);
  });

  it("keeps trips:manage for dispatcher and manager", () => {
    expect(hasPermission("dispatcher", "trips:manage")).toBe(true);
    expect(hasPermission("manager", "trips:manage")).toBe(true);
    expect(hasPermission("dispatcher", "fuel:view_rows")).toBe(true);
    expect(hasPermission("dispatcher", "fuel:manage")).toBe(false);
    expect(hasPermission("manager", "fuel:view_rows")).toBe(true);
    expect(hasPermission("manager", "invoices:manage")).toBe(true);
  });

  it("denies employee all fuel access", () => {
    expect(hasPermission("employee", "fuel:self")).toBe(false);
    expect(hasPermission("employee", "fuel:view")).toBe(false);
    expect(hasPermission("employee", "fuel:view_rows")).toBe(false);
  });

  it("gives organisation_admin fuel review and photo access", () => {
    expect(hasPermission("organisation_admin", "fuel:review")).toBe(true);
    expect(hasPermission("organisation_admin", "fuel:photo_view")).toBe(true);
    expect(hasPermission("organisation_admin", "fuel:backcapture")).toBe(true);
  });

  it("gives ops rate_cards manage and company_manager view only", () => {
    expect(hasPermission("organisation_admin", "rate_cards:manage")).toBe(true);
    expect(hasPermission("dispatcher", "rate_cards:manage")).toBe(true);
    expect(hasPermission("company_manager", "rate_cards:view")).toBe(true);
    expect(hasPermission("company_manager", "rate_cards:manage")).toBe(false);
  });

  it("gives ops payroll manage and denies company_manager and driver", () => {
    expect(hasPermission("organisation_admin", "payroll:manage")).toBe(true);
    expect(hasPermission("dispatcher", "payroll:view")).toBe(true);
    expect(hasPermission("company_manager", "payroll:view")).toBe(false);
    expect(hasPermission("driver", "payroll:view")).toBe(false);
  });
});
