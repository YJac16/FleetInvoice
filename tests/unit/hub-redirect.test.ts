import { describe, expect, it } from "vitest";

import { hubPathForRole } from "@/lib/auth/hub-redirect";

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
