"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GeocodedPlace } from "@/features/areas/lib/geocode";
import { getErrorMessage } from "@/utils/errors";

type AreaPlaceSearchProps = {
  onSelect: (place: GeocodedPlace) => void;
};

export function AreaPlaceSearch({ onSelect }: AreaPlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPlaces([]);
      setError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      const controller = new AbortController();
      setLoading(true);
      setError(null);
      void fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          const body = (await res.json()) as {
            places?: GeocodedPlace[];
            error?: string;
          };
          if (!res.ok) {
            throw new Error(body.error ?? "Search failed");
          }
          setPlaces(body.places ?? []);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === "AbortError") return;
          setPlaces([]);
          setError(getErrorMessage(err));
        })
        .finally(() => setLoading(false));

      return () => controller.abort();
    }, 280);

    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="area-place-search">Map search</Label>
      <Input
        id="area-place-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a Cape Town place or address"
        autoComplete="off"
      />
      {loading ? (
        <p className="text-xs text-muted-foreground">Searching…</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {places.length > 0 ? (
        <ul className="max-h-40 overflow-auto rounded-lg border bg-card text-sm">
          {places.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onSelect(place);
                  setQuery(place.placeName);
                  setPlaces([]);
                }}
              >
                <span className="block font-medium">{place.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {place.placeName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
