"use client";

import { useEffect, useRef } from "react";

import { isMapboxConfigured, env } from "@/lib/env";
import {
  createMapboxMap,
  type MapHandle,
  type MapMarker,
} from "@/lib/maps/mapbox";

import "mapbox-gl/dist/mapbox-gl.css";

type DispatchMapProps = {
  markers: MapMarker[];
  className?: string;
};

export function DispatchMap({ markers, className }: DispatchMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<MapHandle | null>(null);

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
    });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    handleRef.current?.setMarkers(markers);
  }, [markers]);

  if (!isMapboxConfigured()) {
    return (
      <div
        className={
          className ??
          "flex h-[360px] items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground"
        }
      >
        Set NEXT_PUBLIC_MAPBOX_TOKEN to show the live map.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? "h-[360px] w-full overflow-hidden rounded-md border"}
    />
  );
}
