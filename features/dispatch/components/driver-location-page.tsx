"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useOrg } from "@/components/layout/org-context";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useActiveOrgId } from "@/hooks/use-active-org-id";
import { ingestGpsPoints } from "@/services/gps.service";
import { getErrorMessage } from "@/utils/errors";

export function DriverLocationPage() {
  const { can } = useOrg();
  const organisationId = useActiveOrgId();
  const canPublish = can("gps:publish");
  const [sharing, setSharing] = useState(false);
  const [lastPoint, setLastPoint] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const bufferRef = useRef<
    Array<{ lat: number; lng: number; accuracy_m: number | null; recorded_at: string }>
  >([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ingestMutation = useMutation({
    mutationFn: (points: typeof bufferRef.current) => {
      if (!organisationId) throw new Error("No organisation");
      return ingestGpsPoints(organisationId, points);
    },
    onSuccess: (count) => {
      toast.success(`Sent ${count} GPS point${count === 1 ? "" : "s"}`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  function flushBuffer() {
    if (!bufferRef.current.length || !organisationId) return;
    const batch = bufferRef.current.splice(0, bufferRef.current.length);
    ingestMutation.mutate(batch);
  }

  function stopSharing() {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushBuffer();
    setSharing(false);
  }

  function startSharing() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available in this browser");
      return;
    }
    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
          recorded_at: new Date(pos.timestamp).toISOString(),
        };
        bufferRef.current.push(point);
        setLastPoint(
          `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} (±${Math.round(point.accuracy_m ?? 0)}m)`
        );
        if (bufferRef.current.length >= 5) flushBuffer();
      },
      (err) => {
        toast.error(err.message || "Unable to read location");
        stopSharing();
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );
    flushTimerRef.current = setInterval(flushBuffer, 15_000);
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, []);

  if (!canPublish) {
    return (
      <div>
        <PageHeader title="Share location" description="Publish GPS for dispatch." />
        <EmptyState
          title="Driver GPS required"
          description="Link your profile to a driver record to share location."
        />
      </div>
    );
  }

  if (!organisationId) {
    return (
      <div>
        <PageHeader title="Share location" description="Publish GPS for dispatch." />
        <EmptyState title="No organisation" description="Join an organisation first." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Share location"
        description="Broadcast your position to the dispatch board while on a trip."
      />
      <Card>
        <CardHeader>
          <CardTitle>{sharing ? "Sharing live" : "Location off"}</CardTitle>
          <CardDescription>
            Points are batched and sent every 15 seconds (or sooner if the buffer fills).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastPoint ? (
            <p className="font-mono text-sm text-muted-foreground">{lastPoint}</p>
          ) : null}
          {sharing ? (
            <Button type="button" variant="destructive" onClick={stopSharing}>
              Stop sharing
            </Button>
          ) : (
            <Button type="button" onClick={startSharing}>
              Start sharing
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
