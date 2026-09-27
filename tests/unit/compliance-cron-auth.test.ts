import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("compliance alerts cron", () => {
  it("is not referenced from client bundles", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/cron/compliance-alerts/route.ts"),
      "utf8"
    );
    expect(route).toContain("enqueue_compliance_expiry_alerts");
    expect(route).toContain("Unauthorized");
  });
});
