"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useActiveOrgId } from "@/hooks/use-active-org-id";
import {
  PRESENCE_ONLINE_MS,
  resolveDriverPresenceState,
  type DriverPresenceState,
} from "@/features/driver-portal/lib/presence";
import { heartbeatDriverPresence } from "@/services/staff-trips.service";

/** Ping interval while the portal tab is visible (online window remains 60s). */
const HEARTBEAT_INTERVAL_MS = 30_000;
const TICK_MS = 5_000;

type PresenceContextValue = {
  state: DriverPresenceState;
  lastBeatAt: number | null;
  markSigningOut: () => void;
};

const PresenceContext = createContext<PresenceContextValue>({
  state: "offline",
  lastBeatAt: null,
  markSigningOut: () => undefined,
});

export function DriverPresenceProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const organisationId = useActiveOrgId();
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [hasFocus, setHasFocus] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const markSigningOut = useCallback(() => {
    setIsSigningOut(true);
    setLastBeatAt(null);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncVisibility = () => {
      setIsVisible(document.visibilityState === "visible");
      setHasFocus(document.hasFocus());
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("focus", syncVisibility);
    window.addEventListener("blur", syncVisibility);

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("focus", syncVisibility);
      window.removeEventListener("blur", syncVisibility);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!enabled || !organisationId || isSigningOut) return;
    if (!isVisible || !hasFocus) return;

    let cancelled = false;

    async function beat() {
      if (cancelled || document.visibilityState !== "visible" || !document.hasFocus()) {
        return;
      }
      try {
        await heartbeatDriverPresence(organisationId!);
        if (!cancelled) setLastBeatAt(Date.now());
      } catch {
        /* best-effort; stay offline until a beat succeeds */
      }
    }

    void beat();
    const beatId = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(beatId);
    };
  }, [enabled, organisationId, isVisible, hasFocus, isSigningOut]);

  const state = useMemo(
    () =>
      resolveDriverPresenceState({
        lastBeatAt,
        isVisible,
        hasFocus,
        isAuthenticated: Boolean(organisationId) && !isSigningOut,
        isSigningOut,
        now,
      }),
    [lastBeatAt, isVisible, hasFocus, organisationId, isSigningOut, now]
  );

  return (
    <PresenceContext.Provider value={{ state, lastBeatAt, markSigningOut }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useDriverPresence() {
  return useContext(PresenceContext);
}

/** @deprecated use resolveDriverPresenceState from lib/presence */
export function isPresenceOnline(lastBeatAt: number | null): boolean {
  return resolveDriverPresenceState({
    lastBeatAt,
    isVisible: true,
    hasFocus: true,
    isAuthenticated: true,
    now: Date.now(),
  }) === "online";
}

export { PRESENCE_ONLINE_MS };
