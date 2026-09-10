import { describe, expect, it } from "vitest";

import { parseMailerSendFrom } from "@/lib/mailersend";

describe("parseMailerSendFrom", () => {
  it("parses name and email from angle-bracket format", () => {
    expect(parseMailerSendFrom("WorkOps <noreply@workops.app>")).toEqual({
      name: "WorkOps",
      email: "noreply@workops.app",
    });
  });

  it("returns email only when no display name is present", () => {
    expect(parseMailerSendFrom("noreply@workops.app")).toEqual({
      email: "noreply@workops.app",
    });
  });
});
