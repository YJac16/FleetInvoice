import type { Map as MapboxMap, Marker } from "mapbox-gl";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
};

export type MapHandle = {
  map: MapboxMap;
  setMarkers: (markers: MapMarker[]) => void;
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

  function destroy() {
    for (const marker of markersById.values()) marker.remove();
    markersById.clear();
    map.remove();
  }

  return { map, setMarkers, destroy };
}
