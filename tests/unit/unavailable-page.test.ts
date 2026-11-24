/**
 * /app/unavailable: the 503 landing page must never link into a module-gated
 * hub (company manager -> portal, employee -> passengers), or the guard would
 * bounce the user straight back here.
 */
import { describe, expect, it } from "vitest";

import { noAccessHomeHref, UNAVAILABLE_PATH } from "@/lib/auth/hub-redirect";

const session = (activeRole: string | null, isPlatformOwner = false) =>
  ({ activeRole, isPlatformOwner, memberships: [{}] }) as Parameters<typeof noAccessHomeHref>[0];

describe("unavailable page home link (hubEntitled=false, as on 503)", () => {
  it("exports the path guards redirect to", () => {
    expect(UNAVAILABLE_PATH).toBe("/app/unavailable");
  });

  it.each(["company_manager", "employee"])("has no home link for %s", (role) => {
    expect(noAccessHomeHref(session(role), false)).toBeNull();
  });

  it.each([
    ["organisation_admin", "/dashboard"],
    ["manager", "/dashboard"],
    ["driver", "/driver"],
  ])("links %s to %s", (role, href) => {
    expect(noAccessHomeHref(session(role), false)).toBe(href);
  });

  it("links the platform owner to /dashboard", () => {
    expect(noAccessHomeHref(session(null, true), false)).toBe("/dashboard");
  });
});
