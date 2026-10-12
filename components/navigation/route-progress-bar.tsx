"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PRIMARY_ROUTE_QUERY_META } from "@/lib/react-query/primary-route-meta";
import { cn } from "@/lib/utils";

function isPrimaryRouteFetching(
  queryClient: ReturnType<typeof useQueryClient>
) {
  return (
    queryClient.isFetching({
      predicate: (query) =>
        query.meta?.[PRIMARY_ROUTE_QUERY_META] === true,
    }) > 0
  );
}

export function RouteProgressBar() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const bootstrappedRef = useRef(false);
  const prevRouteKeyRef = useRef(routeKey);
  const [sessionActive, setSessionActive] = useState(false);
  const [navSettled, setNavSettled] = useState(true);
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
    setSessionActive(true);
    setNavSettled(false);
    setProgress((p) => (p < 12 ? 12 : p));

    let cancelled = false;
    const waitForRouteQueries = async () => {
      const startedAt = Date.now();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      let sawPrimaryFetch = false;
      const deadline = startedAt + 2_500;
      while (!cancelled && Date.now() < deadline) {
        const fetching = isPrimaryRouteFetching(queryClient);
        if (fetching) sawPrimaryFetch = true;
        if (sawPrimaryFetch && !fetching) break;
        if (!sawPrimaryFetch && Date.now() - startedAt > 450) break;
        await new Promise((r) => window.setTimeout(r, 48));
      }
      if (!cancelled) setNavSettled(true);
    };
    void waitForRouteQueries();

    return () => {
      cancelled = true;
    };
  }, [routeKey, queryClient]);

  const running = sessionActive || primaryFetching || !navSettled;

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
    if (!navSettled || primaryFetching) return;

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setProgress(100);
        window.setTimeout(() => {
          setSessionActive(false);
          setProgress(0);
        }, 240);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [sessionActive, navSettled, primaryFetching, routeKey]);

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
