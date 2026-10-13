import { describe, expect, it } from "vitest";

import { semverAtLeast } from "@/lib/next/semver";
import { nextSupportsHistoryReplaceStateSync } from "@/lib/next/supports-history-url-sync";

describe("semverAtLeast", () => {
  it("treats 14.0 as before 14.1", () => {
    expect(semverAtLeast("14.0.4", 14, 1)).toBe(false);
  });

  it("treats 14.1+ as supported", () => {
    expect(semverAtLeast("14.1.0", 14, 1)).toBe(true);
    expect(semverAtLeast("^15.5.20", 14, 1)).toBe(true);
  });
});

describe("nextSupportsHistoryReplaceStateSync", () => {
  it("is true for the pinned Next version in package.json", () => {
    expect(nextSupportsHistoryReplaceStateSync()).toBe(true);
  });
});
