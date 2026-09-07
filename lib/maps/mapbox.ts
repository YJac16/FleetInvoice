import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
};

export type MapPath = {
  id: string;
  coordinates: [number, number][];
  color?: string;
};

export type MapHandle = {
  map: MapboxMap;
  setMarkers: (markers: MapMarker[]) => void;
  setPaths: (paths: MapPath[]) => void;
  fitBounds: (coordinates: [number, number][], padding?: number) => void;
  destroy: () => void;
};

/**
 * Mapbox-backed map adapter. Call only in the browser after mapbox-gl CSS is loaded.
 */
export async function createMapboxMap(
  container: HTMLElement,
  options: {
    accessToken: string;
    center?: [number, number];
    zoom?: number;
  }
): Promise<MapHandle> {
  const mapboxgl = (await import("mapbox-gl")).default;
  mapboxgl.accessToken = options.accessToken;

  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/streets-v12",
    center: options.center ?? [28.0473, -26.2041],
    zoom: options.zoom ?? 10,
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

  const markersById = new Map<string, Marker>();
  const pathIds = new Set<string>();

  function runWhenReady(fn: () => void) {
    if (map.isStyleLoaded()) {
      fn();
      return;
    }
    map.once("load", fn);
  }

  function setMarkers(markers: MapMarker[]) {
    const nextIds = new Set(markers.map((m) => m.id));
    for (const [id, marker] of markersById) {
      if (!nextIds.has(id)) {
        marker.remove();
        markersById.delete(id);
      }
    }
    for (const m of markers) {
      const existing = markersById.get(m.id);
      if (existing) {
        existing.setLngLat([m.lng, m.lat]);
        continue;
      }
      const el = document.createElement("div");
      el.className = "workops-map-marker";
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "9999px";
      el.style.background = m.color ?? "#0f766e";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
      if (m.label) el.title = m.label;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.lng, m.lat])
        .addTo(map);
      markersById.set(m.id, marker);
    }
  }

  function setPaths(paths: MapPath[]) {
    runWhenReady(() => {
      const nextIds = new Set(paths.map((p) => p.id));

      for (const id of pathIds) {
        if (nextIds.has(id)) continue;
        const layerId = `path-layer-${id}`;
        const sourceId = `path-source-${id}`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        pathIds.delete(id);
      }

      for (const path of paths) {
        if (path.coordinates.length < 2) continue;

        const sourceId = `path-source-${path.id}`;
        const layerId = `path-layer-${path.id}`;
        const data = {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: path.coordinates,
          },
        };

        const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (existing) {
          existing.setData(data);
        } else {
          map.addSource(sourceId, { type: "geojson", data });
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": path.color ?? "#2563eb",
              "line-width": 4,
              "line-opacity": 0.85,
            },
          });
        }
        pathIds.add(path.id);
      }
    });
  }

  function fitBounds(coordinates: [number, number][], padding = 48) {
    if (coordinates.length === 0) return;
    runWhenReady(() => {
      const bounds = coordinates.reduce(
        (b, coord) => b.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding, maxZoom: 15, duration: 600 });
    });
  }

  function destroy() {
    for (const marker of markersById.values()) marker.remove();
    markersById.clear();
    for (const id of pathIds) {
      const layerId = `path-layer-${id}`;
      const sourceId = `path-source-${id}`;
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }
    pathIds.clear();
    map.remove();
  }

  return { map, setMarkers, setPaths, fitBounds, destroy };
}
