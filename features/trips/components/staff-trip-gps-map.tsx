"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";

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

const EMPTY_PATHS: MapPath[] = [];

function isFiniteCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  );
}

/** Drop markers / path points with missing or invalid coordinates (mapbox throws on NaN). */
export function sanitizeMapMarkers(markers: MapMarker[]): MapMarker[] {
  return markers.filter((m) => isFiniteCoord(m.lat, m.lng));
}

export function sanitizeMapPaths(paths: MapPath[]): MapPath[] {
  return paths.map((p) => ({
    ...p,
    coordinates: p.coordinates.filter(([lng, lat]) => isFiniteCoord(lat, lng)),
  }));
}

function MapUnavailable({ className, message }: { className?: string; message: string }) {
  return (
    <div
      className={
        className
          ? `${className} flex items-center justify-center bg-muted/40 text-sm text-muted-foreground`
          : "flex h-[320px] items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground"
      }
    >
      {message}
    </div>
  );
}

/**
 * Keeps a map failure (WebGL unavailable, bad GPS row, Mapbox error) local to the
 * map box instead of replacing the whole page with the route error screen.
 */
class MapErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Staff trip map failed", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function StaffTripGpsMap(props: StaffTripGpsMapProps) {
  return (
    <MapErrorBoundary
      fallback={
        <MapUnavailable
          className={props.className}
          message="Map unavailable in this browser. Trips below are unaffected."
        />
      }
    >
      <StaffTripGpsMapInner {...props} />
    </MapErrorBoundary>
  );
}

function StaffTripGpsMapInner({
  markers: rawMarkers,
  paths: rawPaths = EMPTY_PATHS,
  fitToPathId = null,
  className,
  emptyMessage = "No GPS data to show.",
}: StaffTripGpsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const fittedPathRef = useRef<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  const markers = sanitizeMapMarkers(rawMarkers);
  const paths = sanitizeMapPaths(rawPaths);
  const markersKey = JSON.stringify(markers);
  const pathsKey = JSON.stringify(paths);

  // Never let a map call throw into React; log and degrade instead.
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      console.error("Staff trip map update failed", error);
    }
  };

  useEffect(() => {
    if (!containerRef.current || !isMapboxConfigured()) return;
    let cancelled = false;

    createMapboxMap(containerRef.current, {
      accessToken: env.NEXT_PUBLIC_MAPBOX_TOKEN!,
    })
      .then((handle) => {
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        safely(() => handle.setMarkers(markers));
        safely(() => handle.setPaths(paths));
      })
      .catch((error) => {
        console.error("Staff trip map could not start", error);
        if (!cancelled) setMapFailed(true);
      });

    return () => {
      cancelled = true;
      safely(() => handleRef.current?.destroy());
      handleRef.current = null;
      fittedPathRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    safely(() => handleRef.current?.setMarkers(markers));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  }, [markersKey]);

  useEffect(() => {
    safely(() => handleRef.current?.setPaths(paths));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  }, [pathsKey]);

  useEffect(() => {
    if (!fitToPathId) {
      fittedPathRef.current = null;
      return;
    }
    if (fittedPathRef.current === fitToPathId) return;
    const path = paths.find((p) => p.id === fitToPathId);
    if (!path || path.coordinates.length < 2) return;
    safely(() => handleRef.current?.fitBounds(path.coordinates));
    fittedPathRef.current = fitToPathId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content
  }, [fitToPathId, pathsKey]);

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

  if (mapFailed) {
    return (
      <MapUnavailable
        className={className}
        message="Map unavailable in this browser. Trips below are unaffected."
      />
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
