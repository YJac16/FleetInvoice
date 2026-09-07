/** Presence window aligned with driver portal heartbeat (ms). */
export const PRESENCE_ONLINE_MS = 60_000;

export type DriverPresenceState = "online" | "offline" | "signing_out";

export type ResolvePresenceInput = {
  lastBeatAt: number | null;
  isVisible: boolean;
  hasFocus: boolean;
  isAuthenticated: boolean;
  isSigningOut?: boolean;
  now?: number;
};

/**
 * Green only when signed in, portal visible + focused, and a recent heartbeat landed.
 * Never defaults to online without a successful beat in the window.
 */
export function resolveDriverPresenceState({
  lastBeatAt,
  isVisible,
  hasFocus,
  isAuthenticated,
  isSigningOut = false,
  now = Date.now(),
}: ResolvePresenceInput): DriverPresenceState {
  if (isSigningOut) return "signing_out";
  if (!isAuthenticated) return "offline";
  if (!isVisible || !hasFocus) return "offline";
  if (lastBeatAt == null) return "offline";
  if (now - lastBeatAt > PRESENCE_ONLINE_MS) return "offline";
  return "online";
}

export function presenceStateLabel(state: DriverPresenceState): string {
  switch (state) {
    case "online":
      return "Online";
    case "signing_out":
      return "Signed out";
    default:
      return "Offline";
  }
}
