import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("one BusyButton", () => {
  it("has no components/admin/busy-button.tsx", () => {
    expect(existsSync(join(root, "components/admin/busy-button.tsx"))).toBe(false);
    expect(existsSync(join(root, "components/ui/busy-button.tsx"))).toBe(true);
  });

  it("is not imported from the old path anywhere", () => {
    let hits = "";
    try {
      hits = execFileSync(
        "git",
        ["grep", "-l", "admin/busy-button", "--", "*.ts", "*.tsx"],
        { cwd: root, encoding: "utf8" }
      );
    } catch {
      hits = ""; // git grep exits 1 when nothing matches
    }
    expect(hits.split("\n").filter((f) => f && f !== "tests/unit/single-busy-button.test.ts")).toEqual([]);
  });
});
