import { describe, expect, it } from "vitest";

import {
  hubHrefForSession,
  hubModuleForRole,
  hubPathForRole,
  noAccessHomeHref,
  tripsHrefForRole,
} from "@/lib/auth/hub-redirect";

describe("hubPathForRole", () => {
  it("sends company managers to company hub", () => {
    expect(hubPathForRole("company_manager")).toBe("/company");
  });

  it("sends drivers to driver portal", () => {
    expect(hubPathForRole("driver")).toBe("/driver");
  });

  it("sends employees to employee portal", () => {
    expect(hubPathForRole("employee")).toBe("/employee");
  });

  it("sends ops roles to dashboard", () => {
    expect(hubPathForRole("dispatcher")).toBe("/dashboard");
    expect(hubPathForRole("organisation_admin")).toBe("/dashboard");
  });

  it("prefers dashboard for platform owners", () => {
    expect(hubPathForRole("driver", true)).toBe("/dashboard");
  });
});

describe("hubHrefForSession", () => {
  it("sends signed-out users to login, not dashboard", () => {
    expect(hubHrefForSession(null)).toBe("/login");
  });

  it("sends members without an organisation to awaiting invite", () => {
    expect(
      hubHrefForSession({
        activeRole: null,
        isPlatformOwner: false,
        memberships: [],
      })
    ).toBe("/awaiting-invite");
  });

  it("uses the role hub for active memberships", () => {
    expect(
      hubHrefForSession({
        activeRole: "driver",
        isPlatformOwner: false,
        memberships: [{}],
      })
    ).toBe("/driver");
    expect(
      hubHrefForSession({
        activeRole: "dispatcher",
        isPlatformOwner: false,
        memberships: [{}],
      })
    ).toBe("/dashboard");
  });
});

describe("hubModuleForRole", () => {
  it("gates the company manager hub on portal and the employee hub on passengers", () => {
    expect(hubModuleForRole("company_manager")).toBe("portal");
    expect(hubModuleForRole("employee")).toBe("passengers");
  });

  it("leaves drivers, ops roles and platform owners ungated", () => {
    expect(hubModuleForRole("driver")).toBeNull();
    expect(hubModuleForRole("dispatcher")).toBeNull();
    expect(hubModuleForRole("organisation_admin")).toBeNull();
    expect(hubModuleForRole(null)).toBeNull();
    expect(hubModuleForRole("company_manager", true)).toBeNull();
  });
});

describe("noAccessHomeHref", () => {
  const member = (activeRole: "company_manager" | "employee" | "driver" | "manager") => ({
    activeRole,
    isPlatformOwner: false,
    memberships: [{}],
  });

  it("offers no home link when the user's own hub is the denied module", () => {
    expect(noAccessHomeHref(member("company_manager"), false)).toBeNull();
    expect(noAccessHomeHref(member("employee"), false)).toBeNull();
  });

  it("links to the role hub when it is still reachable", () => {
    expect(noAccessHomeHref(member("company_manager"), true)).toBe("/company");
    expect(noAccessHomeHref(member("employee"), true)).toBe("/employee");
    expect(noAccessHomeHref(member("manager"), false)).toBe("/dashboard");
    expect(noAccessHomeHref(member("driver"), false)).toBe("/driver");
  });

  it("falls back like hubHrefForSession", () => {
    expect(noAccessHomeHref(null, true)).toBe("/login");
    expect(
      noAccessHomeHref({ activeRole: null, isPlatformOwner: false, memberships: [] }, true)
    ).toBe("/awaiting-invite");
  });
});

describe("tripsHrefForRole", () => {
  it("uses the ops trips list by default", () => {
    expect(tripsHrefForRole("dispatcher")).toBe("/trips");
    expect(tripsHrefForRole(null)).toBe("/trips");
  });

  it("sends drivers to their trips hub", () => {
    expect(tripsHrefForRole("driver")).toBe("/driver");
  });

  it("sends employees to seat booking", () => {
    expect(tripsHrefForRole("employee")).toBe("/employee/book");
  });

  it("keeps company managers on the company hub", () => {
    expect(tripsHrefForRole("company_manager")).toBe("/company");
  });

  it("prefers ops trips for platform owners", () => {
    expect(tripsHrefForRole("driver", true)).toBe("/trips");
  });
});
