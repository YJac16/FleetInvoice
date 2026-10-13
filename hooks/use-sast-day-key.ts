"use client";

import { useEffect, useState } from "react";

import { todayInListTz } from "@/lib/date-range/sast-range";

/** Recomputes when SAST calendar day changes (timer, tab focus, or visibility). */
export function useSastDayKey(pollIntervalMs = 60_000): string {
  const [dayKey, setDayKey] = useState(() => todayInListTz());

  useEffect(() => {
    const sync = () => {
      const next = todayInListTz();
      setDayKey((prev) => (prev === next ? prev : next));
    };

    sync();
    const interval = window.setInterval(sync, pollIntervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", sync);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", sync);
    };
  }, [pollIntervalMs]);

  return dayKey;
}
