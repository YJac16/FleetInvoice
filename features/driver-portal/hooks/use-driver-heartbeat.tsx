"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { heartbeatDriverPresence } from "@/services/staff-trips.service";

const HEARTBEAT_MS = 60_000;

type PresenceContextValue = {
  lastBeatAt: number | null;
  online: boolean;
};

const PresenceContext = createContext<PresenceContextValue>({
  lastBeatAt: null,
  online: false,
});

export function isPresenceOnline(lastBeatAt: number | null): boolean {
  if (lastBeatAt == null) return false;
  return Date.now() - lastBeatAt <= HEARTBEAT_MS;
}

export function DriverPresenceProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const organisationId = useActiveOrgId();
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!enabled || !organisationId) return;

    let cancelled = false;

    async function beat() {
      if (cancelled) return;
      try {
        await heartbeatDriverPresence(organisationId!);
        if (!cancelled) setLastBeatAt(Date.now());
      } catch {
        /* best-effort */
      }
    }

    void beat();
    const beatId = window.setInterval(() => void beat(), HEARTBEAT_MS);
    const tickId = window.setInterval(() => tick((n) => n + 1), 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(beatId);
      window.clearInterval(tickId);
    };
  }, [enabled, organisationId]);

  const online = isPresenceOnline(lastBeatAt);

  return (
    <PresenceContext.Provider value={{ lastBeatAt, online }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useDriverPresence() {
  return useContext(PresenceContext);
}
