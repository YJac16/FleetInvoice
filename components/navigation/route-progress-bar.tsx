"use client";

import { useIsFetching } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PRIMARY_ROUTE_QUERY_META } from "@/lib/react-query/primary-route-meta";
import { cn } from "@/lib/utils";

const SETTLE_DEBOUNCE_MS = 120;
const MAX_SESSION_MS = 15_000;
const NO_PRIMARY_GRACE_MS = 500;

export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const bootstrappedRef = useRef(false);
  const prevRouteKeyRef = useRef(routeKey);
  const awaitingPrimaryRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const trickleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const primaryFetching =
    useIsFetching({
      predicate: (query) =>
        query.meta?.[PRIMARY_ROUTE_QUERY_META] === true,
    }) > 0;

  useEffect(() => {
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      prevRouteKeyRef.current = routeKey;
      return;
    }
    if (routeKey === prevRouteKeyRef.current) return;
    prevRouteKeyRef.current = routeKey;
    awaitingPrimaryRef.current = true;
    sessionStartedAtRef.current = Date.now();
    setSessionActive(true);
    setProgress((p) => (p < 12 ? 12 : p));
  }, [routeKey]);

  useEffect(() => {
    if (primaryFetching) {
      awaitingPrimaryRef.current = false;
    }
  }, [primaryFetching]);

  const running = sessionActive || primaryFetching;

  useEffect(() => {
    if (!running) {
      if (trickleTimerRef.current) {
        clearInterval(trickleTimerRef.current);
        trickleTimerRef.current = null;
      }
      return;
    }
    if (trickleTimerRef.current) return;
    trickleTimerRef.current = setInterval(() => {
      setProgress((p) => (p >= 92 ? p : Math.min(92, p + 1.5 + Math.random() * 2)));
    }, 160);
    return () => {
      if (trickleTimerRef.current) {
        clearInterval(trickleTimerRef.current);
        trickleTimerRef.current = null;
      }
    };
  }, [running]);

  useEffect(() => {
    if (!sessionActive) return;

    const elapsed = Date.now() - sessionStartedAtRef.current;
    if (elapsed >= MAX_SESSION_MS) {
      setProgress(100);
      window.setTimeout(() => {
        setSessionActive(false);
        setProgress(0);
      }, 240);
      return;
    }

    if (primaryFetching) return;

    const stillAwaiting =
      awaitingPrimaryRef.current &&
      elapsed < NO_PRIMARY_GRACE_MS;
    if (stillAwaiting) return;

    const timeout = window.setTimeout(() => {
      if (primaryFetching) return;
      setProgress(100);
      window.setTimeout(() => {
        setSessionActive(false);
        setProgress(0);
      }, 240);
    }, SETTLE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [sessionActive, primaryFetching, routeKey]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden print:hidden",
        progress === 0 && !running && "opacity-0"
      )}
      aria-hidden
    >
      <div
        className={cn(
          "h-full origin-left bg-accent shadow-[0_0_10px_rgba(0,109,255,0.55)] motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none",
          running || progress > 0 ? "opacity-100" : "opacity-0"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
