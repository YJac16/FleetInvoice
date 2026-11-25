import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DMPR_SOURCE,
  parseDmprRelease,
  parseEffectiveDate,
  parseLitrePrice,
} from "@/lib/fuel/dmpr";

// DEMO fixture: fake numbers, not official DMPR rates.
const DEMO = readFileSync(path.resolve(__dirname, "../fixtures/dmpr/demo-release.html"), "utf8");

describe("DMPR release parser", () => {
  it("parses the four grades for coastal and inland, c/l -> R/l", () => {
    const r = parseDmprRelease(DEMO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.effectiveFrom).toBe("2099-01-07");
    expect(r.rows).toHaveLength(8);
    const by = Object.fromEntries(r.rows.map((x) => [`${x.fuel_type}|${x.region}`, x.price_per_litre]));
    expect(by).toEqual({
      "petrol_93|coastal": 11.1111,
      "petrol_93|inland": 12.2222,
      "petrol_95|coastal": 11.3333,
      "petrol_95|inland": 12.4444,
      "diesel_500ppm|coastal": 10.5555,
      "diesel_500ppm|inland": 11.6666,
      "diesel_50ppm|coastal": 10.7777,
      "diesel_50ppm|inland": 11.8888,
    });
    expect(r.rows.every((x) => x.effective_from === "2099-01-07")).toBe(true);
  });

  it("source tag is official, never DEMO", () => {
    expect(DMPR_SOURCE).toBe("dmpr_official");
    expect(DMPR_SOURCE).not.toMatch(/demo/i);
  });

  it("fails (no rows) without an effective date", () => {
    const r = parseDmprRelease(DEMO.replace(/effective from[^<]*/i, "coming soon"));
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/effective date/i) });
  });

  it("fails when a grade or region is missing — never partial", () => {
    const r = parseDmprRelease(DEMO.replace(/<tr><td>Petrol 95[\s\S]*?<\/tr>/, ""));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/petrol_95 coastal, petrol_95 inland/);
  });

  it("fails on implausible values instead of guessing", () => {
    const r = parseDmprRelease(DEMO.replace("1 111.11", "1.11"));
    expect(r.ok).toBe(false);
  });

  it("fails on an unrelated page", () => {
    expect(parseDmprRelease("<html><body>Maintenance — please try later, effective from 1 January 2099</body></html>").ok).toBe(false);
    expect(parseDmprRelease("").ok).toBe(false);
  });

  it("helpers", () => {
    expect(parseEffectiveDate("effective from Wednesday, 3 December 2025")).toBe("2025-12-03");
    expect(parseEffectiveDate("effective 2025-12-03")).toBe("2025-12-03");
    expect(parseEffectiveDate("effective from 31 February 2025")).toBeNull();
    expect(parseLitrePrice("2 046.43")).toBe(20.4643);
    expect(parseLitrePrice("2,046.43")).toBe(20.4643);
    expect(parseLitrePrice("R20.46")).toBe(20.46);
    expect(parseLitrePrice("n/a")).toBeNull();
  });
});
