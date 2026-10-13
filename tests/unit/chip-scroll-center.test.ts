import { describe, expect, it } from "vitest";

import { computeChipCenterScrollLeft } from "@/lib/date-range/chip-scroll-center";

describe("computeChipCenterScrollLeft", () => {
  it("centers the chip horizontally within the scroller viewport", () => {
    expect(
      computeChipCenterScrollLeft({
        chipOffsetLeft: 200,
        chipOffsetWidth: 80,
        scrollerClientWidth: 390,
        scrollerScrollWidth: 900,
      })
    ).toBe(45);
  });

  it("clamps to zero when the chip is near the start", () => {
    expect(
      computeChipCenterScrollLeft({
        chipOffsetLeft: 10,
        chipOffsetWidth: 72,
        scrollerClientWidth: 412,
        scrollerScrollWidth: 800,
      })
    ).toBe(0);
  });

  it("clamps to max scroll when the chip is near the end", () => {
    expect(
      computeChipCenterScrollLeft({
        chipOffsetLeft: 720,
        chipOffsetWidth: 88,
        scrollerClientWidth: 390,
        scrollerScrollWidth: 820,
      })
    ).toBe(430);
  });
});
