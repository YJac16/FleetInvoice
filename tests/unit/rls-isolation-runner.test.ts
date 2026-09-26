import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const runRls = process.env.WORKOPS_RUN_RLS === "1";

describe("RLS isolation (local Postgres)", () => {
  it.skipIf(!runRls)("enforces org and company boundaries", () => {
    execSync("node scripts/local-db/rls-isolation.test.mjs", {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });
    expect(true).toBe(true);
  });
});
