"use client";

import { useEffect, useState } from "react";

import { formatPortalClock } from "@/lib/time/portal-clock";
import { cn } from "@/lib/utils";

const MINUTE_MS = 60_000;

/**
 * Live date and time in Africa/Johannesburg, shared by every portal header.
 * Updates once a minute so the chrome does not tick every second.
 */
export function PortalClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    function tick() {
      setNow(new Date());
    }

    tick();
    const msUntilNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS);
    let intervalId = 0;
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, MINUTE_MS);
    }, msUntilNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  const shown = now
    ? formatPortalClock(now)
    : { dateLine: "00 Nov", timeLine: "00:00", label: "" };

  return (
    <time
      dateTime={now ? now.toISOString() : undefined}
      aria-label={now ? shown.label : undefined}
      aria-hidden={now ? undefined : true}
      className={cn(
        "inline-flex shrink-0 flex-col justify-center text-xs leading-tight font-medium tabular-nums text-muted-foreground",
        !now && "invisible",
        className
      )}
    >
      <span>{shown.dateLine}</span>
      <span>{shown.timeLine}</span>
    </time>
  );
}
