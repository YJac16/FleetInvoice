import { describe, expect, it } from "vitest";

import { buildInvitationEmail } from "@/lib/notifications/invitation-email";

describe("buildInvitationEmail", () => {
  it("includes org name, role, and invite URL", () => {
    const email = buildInvitationEmail({
      organisationName: "Acme Transport",
      roleLabel: "Dispatcher",
      inviteUrl: "http://localhost:3000/invite/abc",
    });

    expect(email.subject).toContain("Acme Transport");
    expect(email.body).toContain("Dispatcher");
    expect(email.body).toContain("http://localhost:3000/invite/abc");
  });
});
