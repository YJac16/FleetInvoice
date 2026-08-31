import { describe, expect, it } from "vitest";

import {
  hubHrefForSession,
  hubPathForRole,
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
