"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  TRIP_AUTOSAVE_MS,
  TRIP_DRAFT_STORAGE_KEY,
} from "@/lib/trips/constants";
import type { TripFormValues } from "@/features/trips/schemas";

interface StoredDraft {
  values: TripFormValues;
  step: number;
  savedAt: string;
  tripId?: string;
}

export function loadTripDraft(tripId?: string): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRIP_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (tripId && parsed.tripId !== tripId) return null;
    if (!tripId && parsed.tripId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTripDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TRIP_DRAFT_STORAGE_KEY);
}

export function useTripDraftAutosave(options: {
  values: TripFormValues;
  step: number;
  tripId?: string;
  enabled: boolean;
}) {
  const { values, step, tripId, enabled } = options;
  const latest = useRef({ values, step, tripId });
  latest.current = { values, step, tripId };

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      const payload: StoredDraft = {
        values: latest.current.values,
        step: latest.current.step,
        tripId: latest.current.tripId,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(TRIP_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    }, TRIP_AUTOSAVE_MS);

    return () => window.clearInterval(timer);
  }, [enabled]);
}

export function notifyDraftRestored(): void {
  toast.message("Draft restored", {
    description: "Your previous trip form progress was restored.",
  });
}
