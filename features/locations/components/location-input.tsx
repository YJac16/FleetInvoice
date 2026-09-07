"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  filterLocationSuggestions,
  joinAreaPlaces,
  LOCATION_AREA_SEPARATOR,
  normalizeAreaValue,
  splitAreaPlaces,
  type ServiceLocation,
} from "@/features/locations/lib/location-match";
import { listServiceLocations } from "@/services/locations.service";
import { cn } from "@/lib/utils";

export function LocationInput({
  organisationId,
  value,
  onChange,
  label = "Area",
  description,
  disabled = false,
}: {
  organisationId: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const locationsQuery = useQuery({
    queryKey: ["service-locations", organisationId],
    queryFn: () => listServiceLocations(organisationId),
    enabled: Boolean(organisationId),
  });

  const locations = locationsQuery.data ?? [];
  const selectedPlaces = useMemo(() => splitAreaPlaces(value), [value]);

  const suggestions = useMemo(
    () => filterLocationSuggestions(query, locations),
    [query, locations]
  );

  function addPlace(name: string) {
    const next = joinAreaPlaces([...selectedPlaces, name]);
    onChange(next);
    setQuery("");
    setSuggestion(null);
  }

  function removePlace(name: string) {
    onChange(
      joinAreaPlaces(selectedPlaces.filter((place) => place !== name))
    );
  }

  function applyNormalization() {
    const { value: normalized, corrections } = normalizeAreaValue(
      value,
      locations
    );
    onChange(normalized);
    const corrected = corrections.find((item) => item.corrected && item.suggestion);
    setSuggestion(corrected?.suggestion ?? null);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {selectedPlaces.map((place) => (
          <span
            key={place}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs"
          >
            <MapPin className="size-3 text-muted-foreground" />
            {place}
            {!disabled ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removePlace(place)}
                aria-label={`Remove ${place}`}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
      </div>

      {!disabled ? (
        <div className="relative">
          <Input
            value={query}
            placeholder={`Search Cape Town places… (${LOCATION_AREA_SEPARATOR.trim()} for multi-drop)`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                e.preventDefault();
                addPlace(query.trim());
              }
            }}
            onBlur={() => {
              if (value) applyNormalization();
            }}
          />
          {query.trim() && suggestions.length > 0 ? (
            <ul
              className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
              role="listbox"
            >
              {suggestions.map((location: ServiceLocation) => (
                <li key={location.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addPlace(location.name)}
                  >
                    {location.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {suggestion ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Corrected to <span className="font-medium">{suggestion}</span>
        </p>
      ) : null}

      {!disabled && value ? (
        <Button type="button" variant="ghost" size="sm" onClick={applyNormalization}>
          Normalize spelling
        </Button>
      ) : null}
    </div>
  );
}
