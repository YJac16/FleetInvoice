"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * While the on-screen keyboard shrinks the visual viewport, pin a dialog to
 * that visible region so its footer stays above the keyboard.
 * Returns undefined when the keyboard is closed so the dialog stays centered.
 */
export function useVisualViewportDialogStyle(): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 80;
      if (!keyboardOpen) {
        setStyle(undefined);
        return;
      }
      setStyle({
        top: viewport.offsetTop + 12,
        maxHeight: Math.max(220, viewport.height - 24),
        transform: "none",
      });
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return style;
}
