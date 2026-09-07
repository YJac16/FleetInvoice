import { describe, expect, it } from "vitest";

import {
  PRESENCE_ONLINE_MS,
  presenceStateLabel,
  resolveDriverPresenceState,
} from "@/features/driver-portal/lib/presence";

describe("driver presence state", () => {
  const now = 1_000_000;

  it("is offline before first heartbeat", () => {
    expect(
      resolveDriverPresenceState({
        lastBeatAt: null,
        isVisible: true,
        hasFocus: true,
        isAuthenticated: true,
        now,
      })
    ).toBe("offline");
  });

  it("is online with recent beat while visible and focused", () => {
    expect(
      resolveDriverPresenceState({
        lastBeatAt: now - 30_000,
        isVisible: true,
        hasFocus: true,
        isAuthenticated: true,
        now,
      })
    ).toBe("online");
  });

  it("is offline when heartbeat is stale", () => {
    expect(
      resolveDriverPresenceState({
        lastBeatAt: now - PRESENCE_ONLINE_MS - 1,
        isVisible: true,
        hasFocus: true,
        isAuthenticated: true,
        now,
      })
    ).toBe("offline");
  });

  it("is offline when tab is hidden or unfocused", () => {
    expect(
      resolveDriverPresenceState({
        lastBeatAt: now - 5_000,
        isVisible: false,
        hasFocus: true,
        isAuthenticated: true,
        now,
      })
    ).toBe("offline");

    expect(
      resolveDriverPresenceState({
        lastBeatAt: now - 5_000,
        isVisible: true,
        hasFocus: false,
        isAuthenticated: true,
        now,
      })
    ).toBe("offline");
  });

  it("is signing_out when logging out", () => {
    expect(
      resolveDriverPresenceState({
        lastBeatAt: now - 5_000,
        isVisible: true,
        hasFocus: true,
        isAuthenticated: true,
        isSigningOut: true,
        now,
      })
    ).toBe("signing_out");
    expect(presenceStateLabel("signing_out")).toBe("Signed out");
  });
});
