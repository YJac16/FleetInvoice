import { describe, expect, it, vi } from "vitest";

import {
  buildRangeHref,
  commitRangeUrlUpdate,
} from "@/lib/date-range/replace-range-url";
import { resolveDateRange } from "@/lib/date-range/sast-range";

describe("buildRangeHref", () => {
  it("updates range preset in the query string", () => {
    const base = new URLSearchParams("range=this_week&foo=bar");
    const href = buildRangeHref(
      "/trips",
      base,
      resolveDateRange("last_week")
    );
    expect(href).toBe("/trips?range=last_week&foo=bar");
  });

  it("sets custom from/to and keeps other params", () => {
    const href = buildRangeHref(
      "/trips",
      new URLSearchParams("range=this_week"),
      resolveDateRange("custom", "2026-09-01", "2026-09-10")
    );
    expect(href).toBe(
      "/trips?range=custom&from=2026-09-01&to=2026-09-10"
    );
  });
});

describe("commitRangeUrlUpdate", () => {
  it("uses history.replaceState when Next supports URL sync", () => {
    const replaceState = vi.fn();
    const routerReplace = vi.fn();

    commitRangeUrlUpdate("/trips?range=last_week", {
      useHistoryReplaceState: true,
      routerReplace,
      historyReplaceState: replaceState,
      getHistoryState: () => ({ idx: 0 }),
    });

    expect(replaceState).toHaveBeenCalledWith(
      { idx: 0 },
      "",
      "/trips?range=last_week"
    );
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("restores scrollY after router.replace on older Next", () => {
    const routerReplace = vi.fn();
    const restoreScroll = vi.fn();
    const raf = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });

    commitRangeUrlUpdate("/trips?range=last_week", {
      useHistoryReplaceState: false,
      routerReplace,
      getScrollY: () => 412,
      restoreScroll,
      requestAnimationFrame: raf,
    });

    expect(routerReplace).toHaveBeenCalledWith("/trips?range=last_week");
    expect(restoreScroll).toHaveBeenCalledWith(412);
    expect(raf).toHaveBeenCalled();
  });
});
