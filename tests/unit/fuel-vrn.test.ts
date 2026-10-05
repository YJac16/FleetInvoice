import { describe, expect, it } from "vitest";

import { normalizeVrn } from "@/features/fuel/lib/vrn";

describe("VRN normalisation", () => {
  it("strips spaces and dashes and uppercases", () => {
    expect(normalizeVrn("ca 123-456")).toBe("CA123456");
    expect(normalizeVrn("02220WP")).toBe("02220WP");
  });
});
