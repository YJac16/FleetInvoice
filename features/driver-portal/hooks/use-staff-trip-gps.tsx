"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { shouldShareStaffTripGps } from "@/features/driver-portal/lib/gps";
import type { TripStatus } from "@/lib/constants";
import { ingestGpsPoints } from "@/services/gps.service";

const FLUSH_INTERVAL_MS = 20_000;
const MIN_POINTS_BEFORE_FLUSH = 3;

export type StaffTripGpsState =
  | { status: "idle" }
  | {
      status: "sharing";
      lastPoint?: string;
      lastSyncedAt?: string;
    }
  | { status: "denied"; message: string }
  | { status: "unavailable"; message: string };

type GpsBufferPoint = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  recorded_at: string;
  trip_id: string;
};

export function useStaffTripGps(options: {
  organisationId: string | null;
  tripId: string | null;
  tripStatus: TripStatus | null;
  enabled?: boolean;
}): StaffTripGpsState {
  const { organisationId, tripId, tripStatus, enabled = true } = options;
  const sharing = Boolean(
    enabled &&
      organisationId &&
      tripId &&
      shouldShareStaffTripGps(tripStatus)
  );

  const [state, setState] = useState<StaffTripGpsState>({ status: "idle" });
  const watchIdRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bufferRef = useRef<GpsBufferPoint[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [hasFocus, setHasFocus] = useState(true);

  const ingestMutation = useMutation({
    mutationFn: (points: GpsBufferPoint[]) => {
      if (!organisationId) throw new Error("No organisation");
      return ingestGpsPoints(
        organisationId,
        points.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          accuracy_m: p.accuracy_m,
          recorded_at: p.recorded_at,
          trip_id: p.trip_id,
        }))
      );
    },
    onSuccess: () => {
      setState((prev) =>
        prev.status === "sharing"
          ? { ...prev, lastSyncedAt: new Date().toISOString() }
          : prev
      );
    },
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const sync = () => {
      setIsVisible(document.visibilityState === "visible");
      setHasFocus(document.hasFocus());
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, []);

  useEffect(() => {
    if (!sharing || !tripId || !organisationId) {
      setState({ status: "idle" });
      return;
    }

    if (!isVisible || !hasFocus) {
      setState((prev) =>
        prev.status === "sharing" ? { status: "idle" } : prev
      );
      return;
    }

    if (!navigator.geolocation) {
      setState({
        status: "unavailable",
        message: "Geolocation is not available in this browser.",
      });
      return;
    }

    function flushBuffer() {
      if (!bufferRef.current.length || !organisationId || !tripId) return;
      const batch = bufferRef.current.splice(0, bufferRef.current.length);
      ingestMutation.mutate(batch);
    }

    function stopWatch() {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushBuffer();
    }

    setState({ status: "sharing" });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point: GpsBufferPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
          recorded_at: new Date(pos.timestamp).toISOString(),
          trip_id: tripId,
        };
        bufferRef.current.push(point);
        setState({
          status: "sharing",
          lastPoint: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
          lastSyncedAt: undefined,
        });
        if (bufferRef.current.length >= MIN_POINTS_BEFORE_FLUSH) flushBuffer();
      },
      (err) => {
        stopWatch();
        if (err.code === err.PERMISSION_DENIED) {
          setState({
            status: "denied",
            message:
              "Location permission denied. Enable location in browser settings so dispatch can track this trip.",
          });
        } else {
          setState({
            status: "unavailable",
            message: err.message || "Unable to read location.",
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 25_000 }
    );

    flushTimerRef.current = setInterval(flushBuffer, FLUSH_INTERVAL_MS);

    return () => {
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ingestMutation identity is stable enough
  }, [sharing, tripId, tripStatus, organisationId, isVisible, hasFocus]);

  return state;
}
