/**
 * Step 4 (GoOps refocus) — drift check. Every sidebar item gated on a
 * non-core module must have a server guard in its segment layout, and the
 * hub layouts must guard their module. Reads source text only.
 * Run: npm run test:module-guards
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MAIN_NAV, SECONDARY_NAV } from "@/lib/navigation";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** guardModulePage("x") or guardModulePage([... "x" ...]) */
function guardsModule(source: string, module: string): boolean {
  const call = source.match(/guardModulePage\(\s*(\[[^\]]*\]|"[^"]*")/);
  return Boolean(call && call[1]!.includes(`"${module}"`));
}

describe("every non-core nav item has a server guard", () => {
  const gated = [...MAIN_NAV, ...SECONDARY_NAV].filter((item) => item.module !== "core");

  it("there is something to check", () => {
    expect(gated.length).toBeGreaterThan(5);
  });

  it.each(gated.map((i) => [i.href, i.module] as const))("%s (%s)", (href, module) => {
    const rel = `app/(dashboard)${href}/layout.tsx`;
    expect(existsSync(path.join(root, rel)), `${rel} is missing`).toBe(true);
    const source = read(rel);
    if (module === "maintenance") {
      expect(source).toContain('assertMaintenanceAccess("view"');
    } else {
      expect(guardsModule(source, module), `${rel} must guard "${module}"`).toBe(true);
    }
  });
});

describe("hub and special-case guards", () => {
  it.each([
    ["app/(company)/layout.tsx", "portal"],
    ["app/(employee)/layout.tsx", "passengers"],
    ["app/(dashboard)/employees/layout.tsx", "passengers"],
    ["app/(dashboard)/employees/layout.tsx", "attendance"],
  ])("%s guards %s", (rel, module) => {
    expect(guardsModule(read(rel), module)).toBe(true);
  });

  it.each([
    ["app/api/invoices/send/route.ts", "billing"],
    ["app/api/gps/ingest/route.ts", "gps"],
  ])("%s guards %s", (rel, module) => {
    expect(read(rel)).toContain(`guardModuleApi("${module}"`);
  });
});
