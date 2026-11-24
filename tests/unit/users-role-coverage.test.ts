/**
 * Step 6 (GoOps refocus) — drift check. Invitations and role changes must go
 * through the server actions that enforce role entitlements, not the browser
 * client. Reads source text only.
 * Run: npm run test:role-entitlements
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("role assignment goes through the server check", () => {
  const service = read("services/users.service.ts");

  it("users.service no longer calls create_invitation or updates role directly", () => {
    expect(service).not.toMatch(/rpc\(\s*"create_invitation"/);
    expect(service).not.toMatch(/update\(\{\s*role\b/);
    expect(service).toContain("createInvitationAction");
    expect(service).toContain("updateMemberRoleAction");
  });

  it("both actions call assertRoleAssignable before writing", () => {
    const actions = read("features/users/actions.ts");
    for (const name of ["createInvitationAction", "updateMemberRoleAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`));
      const check = body.indexOf("assertRoleAssignable(");
      const write = Math.min(
        ...[body.indexOf('rpc("create_invitation"'), body.indexOf(".update(")].filter((i) => i >= 0)
      );
      expect(check).toBeGreaterThan(0);
      expect(check).toBeLessThan(write);
    }
  });

  it("users page builds role options from entitlement-filtered roles", () => {
    const page = read("features/users/components/users-page.tsx");
    expect(page).toContain("assignableRoles(INVITABLE_ROLES");
    expect(page).not.toMatch(/INVITABLE_ROLES\.map\(/);
  });
});
