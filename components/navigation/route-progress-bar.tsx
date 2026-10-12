"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams.toString()}`;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    setProgress(12);

    const raf = requestAnimationFrame(() => setProgress(55));

    timerRef.current = setTimeout(() => {
      setProgress(100);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    }, 280);

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden print:hidden",
        !visible && "opacity-0"
      )}
      aria-hidden
    >
      <div
        className={cn(
          "h-full origin-left bg-accent shadow-[0_0_8px_rgba(0,109,255,0.45)] motion-safe:transition-[width,opacity] motion-safe:duration-300 motion-safe:ease-out",
          visible ? "opacity-100" : "opacity-0"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
