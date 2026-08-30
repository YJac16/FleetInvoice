"use client";

import { useEffect } from "react";

import { isSessionOnly } from "@/lib/supabase/auth-persistence";

/**
 * When the user chose session-only sign-in, clear the server session when the tab closes.
 */
export function SessionTabListener() {
  useEffect(() => {
    function onPageHide(event: PageTransitionEvent) {
      if (event.persisted || !isSessionOnly()) return;
      fetch("/api/auth/end-session", { method: "POST", keepalive: true });
    }

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  return null;
}
