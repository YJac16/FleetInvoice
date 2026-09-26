import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertBillingManageAccess } from "@/lib/auth/billing-access";

function mockSupabase(options: {
  platformOwner?: boolean;
  orgAdmin?: boolean;
  rpcError?: Error;
}): SupabaseClient {
  const { platformOwner = false, orgAdmin = false, rpcError } = options;
  return {
    rpc: vi.fn((name: string) => {
      if (rpcError) {
        return Promise.resolve({ data: null, error: rpcError });
      }
      if (name === "is_platform_owner") {
        return Promise.resolve({ data: platformOwner, error: null });
      }
      if (name === "has_org_role_names") {
        return Promise.resolve({ data: orgAdmin, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  } as unknown as SupabaseClient;
}

describe("assertBillingManageAccess", () => {
  it("allows platform owners", async () => {
    await expect(
      assertBillingManageAccess(mockSupabase({ platformOwner: true }), "any-org")
    ).resolves.toBeUndefined();
  });

  it("allows organisation admins of the target org", async () => {
    await expect(
      assertBillingManageAccess(
        mockSupabase({ platformOwner: false, orgAdmin: true }),
        "org-a"
      )
    ).resolves.toBeUndefined();
  });

  it("rejects non-admin members and cross-org callers", async () => {
    await expect(
      assertBillingManageAccess(
        mockSupabase({ platformOwner: false, orgAdmin: false }),
        "org-b"
      )
    ).rejects.toThrow(/Not authorised to manage billing/);
  });
});
