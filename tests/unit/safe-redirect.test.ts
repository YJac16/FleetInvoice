import { describe, expect, it } from "vitest";

import { sanitizeAppRedirectPath } from "@/lib/auth/safe-redirect";

describe("sanitizeAppRedirectPath", () => {
  it("allows normal in-app paths", () => {
    expect(sanitizeAppRedirectPath("/hub", "/login")).toBe("/hub");
    expect(sanitizeAppRedirectPath("/invoices/abc/print", "/login")).toBe(
      "/invoices/abc/print"
    );
  });

  it("rejects open redirects", () => {
    expect(sanitizeAppRedirectPath("//evil.com", "/hub")).toBe("/hub");
    expect(sanitizeAppRedirectPath("https://evil.com", "/hub")).toBe("/hub");
    expect(sanitizeAppRedirectPath("/login?next=//evil.com", "/hub")).toBe(
      "/hub"
    );
  });

  it("uses fallback when missing or blank", () => {
    expect(sanitizeAppRedirectPath(null, "/hub")).toBe("/hub");
    expect(sanitizeAppRedirectPath("   ", "/hub")).toBe("/hub");
  });
});
