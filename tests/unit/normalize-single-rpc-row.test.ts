import { describe, expect, it } from "vitest";

import { normalizeSingleRpcRow } from "@/lib/supabase/normalize-single-rpc-row";

type SampleInvitation = {
  id: string;
  email: string;
  role: string;
};

const validInvitation: SampleInvitation = {
  id: "inv-1",
  email: "user@example.com",
  role: "manager",
};

describe("normalizeSingleRpcRow", () => {
  it("unwraps a one-element array result", () => {
    expect(normalizeSingleRpcRow([validInvitation])).toEqual(validInvitation);
  });

  it("accepts a single-object RPC result", () => {
    expect(normalizeSingleRpcRow(validInvitation)).toEqual(validInvitation);
  });

  it("returns null for null and undefined", () => {
    expect(normalizeSingleRpcRow(null)).toBeNull();
    expect(normalizeSingleRpcRow(undefined)).toBeNull();
  });

  it("treats an all-null composite as not found", () => {
    expect(
      normalizeSingleRpcRow({
        id: null,
        email: null,
        role: null,
      })
    ).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(normalizeSingleRpcRow([])).toBeNull();
  });

  it("uses a custom presence key for invitation preview rows without id", () => {
    const preview = {
      org_name: "Acme",
      email: "u***@example.com",
      role: "manager",
      status: "pending",
      expires_at: "2099-01-01T00:00:00Z",
    };
    expect(normalizeSingleRpcRow(preview, "email")).toEqual(preview);
    expect(normalizeSingleRpcRow({ ...preview, email: "" }, "email")).toBeNull();
  });
});
