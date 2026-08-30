"use client";

import { useEffect } from "react";

function readWlCookie(): {
  primary_color?: string | null;
  accent_color?: string | null;
} | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith("workops_wl="))
    ?.slice("workops_wl=".length);
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as {
      primary_color?: string | null;
      accent_color?: string | null;
    };
  } catch {
    return null;
  }
}

/** Applies white-label CSS variables from the middleware cookie. */
export function WhiteLabelTheme() {
  useEffect(() => {
    const wl = readWlCookie();
    if (!wl) return;
    const root = document.documentElement;
    if (wl.primary_color) {
      root.style.setProperty("--primary", wl.primary_color);
    }
    if (wl.accent_color) {
      root.style.setProperty("--ring", wl.accent_color);
      root.style.setProperty("--accent", wl.accent_color);
    }
  }, []);

  return null;
}
