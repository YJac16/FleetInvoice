"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 300;
const NUMERIC = /^(R?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

type Parsed = { prefix: string; target: number; decimals: number; grouped: boolean };

/** Parses a number or a plain/ZAR-style numeric string (`1990`, `R1,990.50`). */
export function parseCountUpValue(value: string | number): Parsed | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    const decimals = (String(value).split(".")[1] ?? "").length;
    return { prefix: "", target: value, decimals, grouped: false };
  }
  const m = NUMERIC.exec(value.trim());
  if (!m || value !== value.trim()) return null;
  return {
    prefix: m[1],
    target: Number(`${m[2].replace(/,/g, "")}${m[3] ? `.${m[3]}` : ""}`),
    decimals: m[3]?.length ?? 0,
    grouped: m[2].includes(","),
  };
}

function format(p: Parsed, n: number): string {
  const [int, frac] = n.toFixed(p.decimals).split(".");
  const grouped = p.grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  return `${p.prefix}${grouped}${frac ? `.${frac}` : ""}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts up to `value` once, on first mount (<=300ms). The server-rendered and
 * final text is always exactly `value`; non-numeric values and reduced motion
 * skip the animation.
 */
export function CountUp({ value }: { value: string | number }) {
  const [text, setText] = useState<string | null>(null); // null = show `value`
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const parsed = parseCountUpValue(value);
    if (!parsed || parsed.target === 0 || prefersReducedMotion()) return;

    let raf = 0;
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min((now - start) / DURATION_MS, 1);
      if (t >= 1) {
        setText(null); // hand back the exact original value
        return;
      }
      const eased = 1 - (1 - t) * (1 - t);
      setText(format(parsed, parsed.target * eased));
      raf = requestAnimationFrame(tick);
    };
    setText(format(parsed, 0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on first data
  }, []);

  return <>{text ?? value}</>;
}
