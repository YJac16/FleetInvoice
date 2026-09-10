"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";

import { circleRing } from "@/features/areas/lib/map-circle";
import { isMapboxConfigured, env } from "@/lib/env";

import "mapbox-gl/dist/mapbox-gl.css";

type AreaCircleMapProps = {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  onCenterChange: (lng: number, lat: number) => void;
  className?: string;
};

const SOURCE_ID = "area-fence";
const FILL_ID = "area-fence-fill";
const LINE_ID = "area-fence-line";

function circleData(lng: number, lat: number, radiusM: number) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [circleRing(lng, lat, radiusM)],
    },
  };
}

export function AreaCircleMap({
  lat,
  lng,
  radiusM,
  onCenterChange,
  className,
}: AreaCircleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;

  useEffect(() => {
    if (!containerRef.current || !isMapboxConfigured()) return;
    let cancelled = false;

    void (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_TOKEN!;
      if (cancelled || !containerRef.current) return;

      const center: [number, number] =
        lng != null && lat != null ? [lng, lat] : [18.4241, -33.9249];
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center,
        zoom: lng != null && lat != null ? 14 : 10,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: circleData(center[0], center[1], radiusM),
        });
        map.addLayer({
          id: FILL_ID,
          type: "fill",
          source: SOURCE_ID,
          paint: { "fill-color": "#0f766e", "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: LINE_ID,
          type: "line",
          source: SOURCE_ID,
          paint: { "line-color": "#0f766e", "line-width": 2 },
        });
      });

      const marker = new mapboxgl.Marker({ draggable: true, color: "#0f766e" })
        .setLngLat(center)
        .addTo(map);
      markerRef.current = marker;
      marker.on("dragend", () => {
        const pos = marker.getLngLat();
        onCenterChangeRef.current(pos.lng, pos.lat);
      });

      map.on("click", (event) => {
        onCenterChangeRef.current(event.lngLat.lng, event.lngLat.lat);
      });
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map init once
  }, []);

  useEffect(() => {
    if (lng == null || lat == null) return;
    markerRef.current?.setLngLat([lng, lat]);
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(circleData(lng, lat, radiusM));
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13), duration: 400 });
  }, [lat, lng, radiusM]);

  if (!isMapboxConfigured()) {
    return (
      <p className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
        Map preview needs a Mapbox token. Search still verifies the place.
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? "h-64 w-full overflow-hidden rounded-xl border"}
    />
  );
}
