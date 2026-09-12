"use client";

import { useEffect, useRef } from "react";

import { isMapboxConfigured, env } from "@/lib/env";
import {
  createMapboxMap,
  type MapHandle,
  type MapMarker,
  type MapPath,
} from "@/lib/maps/mapbox";

import "mapbox-gl/dist/mapbox-gl.css";

type StaffTripGpsMapProps = {
  markers: MapMarker[];
  paths?: MapPath[];
  fitToPathId?: string | null;
  className?: string;
  emptyMessage?: string;
};

export function StaffTripGpsMap({
  markers,
  paths = [],
  fitToPathId = null,
  className,
  emptyMessage = "No GPS data to show.",
}: StaffTripGpsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const fittedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !isMapboxConfigured()) return;
    let cancelled = false;

    void createMapboxMap(containerRef.current, {
      accessToken: env.NEXT_PUBLIC_MAPBOX_TOKEN!,
    }).then((handle) => {
      if (cancelled) {
        handle.destroy();
        return;
      }
      handleRef.current = handle;
      handle.setMarkers(markers);
      handle.setPaths(paths);
    });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
      fittedPathRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    handleRef.current?.setMarkers(markers);
  }, [markers]);

  useEffect(() => {
    handleRef.current?.setPaths(paths);
  }, [paths]);

  useEffect(() => {
    if (!fitToPathId) {
      fittedPathRef.current = null;
      return;
    }
    if (fittedPathRef.current === fitToPathId) return;
    const path = paths.find((p) => p.id === fitToPathId);
    if (!path || path.coordinates.length < 2) return;
    handleRef.current?.fitBounds(path.coordinates);
    fittedPathRef.current = fitToPathId;
  }, [fitToPathId, paths]);

  if (!isMapboxConfigured()) {
    return (
      <div
        className={
          className ??
          "flex h-[320px] items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground"
        }
      >
        Set NEXT_PUBLIC_MAPBOX_TOKEN to show the map.
      </div>
    );
  }

  const hasData = markers.length > 0 || paths.some((p) => p.coordinates.length >= 2);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={className ?? "h-[320px] w-full overflow-hidden rounded-md border"}
      />
      {!hasData ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/20">
          <p className="max-w-[80%] rounded-md border bg-background/95 px-3 py-2 text-center text-xs text-muted-foreground shadow-sm">
            {emptyMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
