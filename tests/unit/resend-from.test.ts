import { describe, expect, it } from "vitest";

import {
  DEFAULT_RESEND_FROM_EMAIL,
  resolveResendFromEmail,
} from "@/lib/notifications/resend-from";

describe("resolveResendFromEmail", () => {
  it("falls back when RESEND_FROM_EMAIL is unset", () => {
    expect(resolveResendFromEmail(undefined)).toBe(DEFAULT_RESEND_FROM_EMAIL);
    expect(resolveResendFromEmail(null)).toBe("GoOps <hello@goops.co.za>");
  });

  it("falls back when RESEND_FROM_EMAIL is empty or whitespace", () => {
    expect(resolveResendFromEmail("")).toBe("GoOps <hello@goops.co.za>");
    expect(resolveResendFromEmail("   ")).toBe("GoOps <hello@goops.co.za>");
    expect(resolveResendFromEmail("\n\t")).toBe("GoOps <hello@goops.co.za>");
  });

  it("uses a set RESEND_FROM_EMAIL and trims surrounding space", () => {
    expect(resolveResendFromEmail("Ops <ops@example.com>")).toBe(
      "Ops <ops@example.com>"
    );
    expect(resolveResendFromEmail("  GoOps <hello@goops.co.za>  ")).toBe(
      "GoOps <hello@goops.co.za>"
    );
  });
});
