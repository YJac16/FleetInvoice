"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  filterLocationSuggestions,
  type ServiceLocation,
} from "@/features/locations/lib/location-match";
import {
  searchMapPlaces,
  verifyMapPlace,
  type MapPlaceSuggestion,
} from "@/features/locations/lib/places-client";
import { proposeServiceLocation } from "@/services/locations.service";
import { cn } from "@/lib/utils";

export type ChosenStop = {
  name: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  source: "catalogue" | "google" | "typed" | "";
};

export function emptyStop(): ChosenStop {
  return { name: "", placeId: null, lat: null, lng: null, source: "" };
}

type DriverLocationFieldProps = {
  organisationId: string;
  label: string;
  value: ChosenStop;
  onChange: (value: ChosenStop) => void;
  locations: ServiceLocation[];
  mapsEnabled: boolean;
  required?: boolean;
};

export function DriverLocationField({
  organisationId,
  label,
  value,
  onChange,
  locations,
  mapsEnabled,
  required,
}: DriverLocationFieldProps) {
  const listId = useId();
  const sessionToken = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mapMatches, setMapMatches] = useState<MapPlaceSuggestion[]>([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [mapPickFailed, setMapPickFailed] = useState(false);
  const [checking, setChecking] = useState(false);

  const suggestions = useMemo(
    () => (query.trim() ? filterLocationSuggestions(query, locations, 8) : []),
    [query, locations]
  );

  useEffect(() => {
    const searched = query.trim();
    if (!mapsEnabled || searched.length < 2) {
      setMapMatches([]);
      setMapSearching(false);
      return;
    }
    let cancelled = false;
    setMapPickFailed(false);
    setMapSearching(true);
    const handle = window.setTimeout(() => {
      void searchMapPlaces(searched, sessionToken.current)
        .then((matches) => {
          if (!cancelled) setMapMatches(matches);
        })
        .catch(() => {
          if (!cancelled) setMapMatches([]);
        })
        .finally(() => {
          if (!cancelled) setMapSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [mapsEnabled, query]);

  const showTypedFallback =
    query.trim().length >= 2 &&
    suggestions.length === 0 &&
    !mapSearching &&
    !checking &&
    (mapMatches.length === 0 || mapPickFailed);

  async function chooseCatalogue(location: ServiceLocation) {
    onChange({
      name: location.name,
      placeId: null,
      lat: null,
      lng: null,
      source: "catalogue",
    });
    setQuery("");
    setOpen(false);
    setMapMatches([]);
  }

  async function chooseMap(match: MapPlaceSuggestion) {
    setChecking(true);
    try {
      const verified = await verifyMapPlace(match.placeId, sessionToken.current);
      if (!verified) {
        setMapPickFailed(true);
        toast.error("Could not check that place. Pick one from the list or type it.");
        return;
      }
      if ("outside" in verified) {
        setMapPickFailed(true);
        toast.error(
          "That place is outside the Cape Town area. Pick a listed place, or type a name for an admin to review."
        );
        return;
      }
      const saved = await proposeServiceLocation({
        organisationId,
        name: verified.name,
        placeId: verified.placeId,
        latitude: verified.latitude,
        longitude: verified.longitude,
        verified: true,
      });
      onChange({
        name: saved.name,
        placeId: verified.placeId,
        lat: verified.latitude,
        lng: verified.longitude,
        source: "google",
      });
      setQuery("");
      setOpen(false);
      setMapMatches([]);
      sessionToken.current = crypto.randomUUID();
    } catch {
      setMapPickFailed(true);
      toast.error("Could not save that place. You can still type it.");
    } finally {
      setChecking(false);
    }
  }

  async function chooseTyped() {
    const name = query.trim();
    if (!name) return;
    setChecking(true);
    try {
      const saved = await proposeServiceLocation({
        organisationId,
        name,
        verified: false,
      });
      onChange({
        name: saved.name,
        placeId: null,
        lat: null,
        lng: null,
        source: "typed",
      });
      toast.message("Saved for next time. An admin will review this place.");
    } catch {
      onChange({
        name,
        placeId: null,
        lat: null,
        lng: null,
        source: "typed",
      });
      toast.message(
        "Using this name for the trip. It could not be saved for next time."
      );
    } finally {
      setChecking(false);
      setQuery("");
      setOpen(false);
      setMapMatches([]);
    }
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={listId}>{label}</Label>
      {value.name ? (
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm"
          onClick={() => {
            setQuery(value.name);
            setOpen(true);
          }}
        >
          <MapPin className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <span className="min-w-0 flex-1 truncate">{value.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">Change</span>
        </button>
      ) : null}
      {open || !value.name ? (
        <div className="space-y-1">
          <Input
            id={listId}
            value={query}
            placeholder="Search places"
            autoComplete="off"
            required={required && !value.name}
            className="min-h-11 w-full min-w-0"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
          />
          {open && query.trim() ? (
            <ul
              className="max-h-60 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md"
              role="listbox"
              aria-label={label}
            >
              {suggestions.map((location) => (
                <li key={location.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted"
                    onClick={() => void chooseCatalogue(location)}
                  >
                    {location.name}
                  </button>
                </li>
              ))}
              {mapMatches.map((match) => (
                <li key={match.placeId}>
                  <button
                    type="button"
                    disabled={checking}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted",
                      checking && "opacity-60"
                    )}
                    onClick={() => void chooseMap(match)}
                  >
                    <span className="min-w-0 flex-1 truncate">{match.name}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Map
                    </span>
                  </button>
                </li>
              ))}
              {showTypedFallback ? (
                <li>
                  <button
                    type="button"
                    disabled={checking}
                    className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground hover:bg-muted"
                    onClick={() => void chooseTyped()}
                  >
                    Use “{query.trim()}” — admin will review
                  </button>
                </li>
              ) : null}
              {suggestions.length === 0 &&
              mapMatches.length === 0 &&
              mapSearching ? (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  Checking the map…
                </li>
              ) : null}
              {suggestions.length === 0 &&
              mapMatches.length === 0 &&
              !mapSearching &&
              !showTypedFallback ? (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  Keep typing to search places.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
