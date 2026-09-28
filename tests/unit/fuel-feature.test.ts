import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  isFuelSlipCaptureEnabled,
  isFuelSlipCaptureUiEnabled,
} from "@/lib/fuel/feature";

describe("fuel slip capture feature flag", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults off when env unset", () => {
    expect(isFuelSlipCaptureEnabled()).toBe(false);
    expect(isFuelSlipCaptureUiEnabled()).toBe(false);
  });

  it("enables only when explicitly true", () => {
    vi.stubEnv("FUEL_SLIP_CAPTURE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_FUEL_SLIP_CAPTURE_ENABLED", "true");
    expect(isFuelSlipCaptureEnabled()).toBe(true);
    expect(isFuelSlipCaptureUiEnabled()).toBe(true);
  });
});
