"use client";

import { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function RouteProgressBar() {
  const { pending: linkPending } = useLinkStatus();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const bootstrappedRef = useRef(false);
  const prevRouteKeyRef = useRef(routeKey);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const trickleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = active || linkPending;

  useEffect(() => {
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      prevRouteKeyRef.current = routeKey;
      return;
    }
    if (routeKey === prevRouteKeyRef.current) return;
    prevRouteKeyRef.current = routeKey;
    setActive(true);
    setProgress((p) => (p < 10 ? 10 : p));
  }, [routeKey]);

  useEffect(() => {
    if (linkPending) {
      setActive(true);
      setProgress((p) => (p < 10 ? 10 : p));
    }
  }, [linkPending]);

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
      setProgress((p) => (p >= 90 ? p : Math.min(90, p + 2 + Math.random() * 2)));
    }, 150);
    return () => {
      if (trickleTimerRef.current) {
        clearInterval(trickleTimerRef.current);
        trickleTimerRef.current = null;
      }
    };
  }, [running]);

  useEffect(() => {
    if (!active || linkPending) return;

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setProgress(100);
        window.setTimeout(() => {
          setActive(false);
          setProgress(0);
        }, 220);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [routeKey, linkPending, active]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden print:hidden",
        progress === 0 && !running && "opacity-0"
      )}
      aria-hidden
    >
      <div
        className={cn(
          "h-full origin-left bg-accent shadow-[0_0_8px_rgba(0,109,255,0.45)] motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none",
          running || progress > 0 ? "opacity-100" : "opacity-0"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
