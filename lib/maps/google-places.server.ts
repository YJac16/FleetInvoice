import "server-only";

import {
  CAPE_TOWN_BOUNDS,
  isInsideCapeTownBounds,
} from "@/lib/maps/cape-town-bounds";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

export type PlaceSuggestion = {
  placeId: string;
  name: string;
};

export type VerifiedPlace = {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
};

export function googlePlacesApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : null;
}

export function googlePlacesEnabled(): boolean {
  return googlePlacesApiKey() != null;
}

export async function autocompletePlaces(
  input: string,
  sessionToken?: string | null
): Promise<PlaceSuggestion[]> {
  const key = googlePlacesApiKey();
  const query = input.trim();
  if (!key || query.length < 2) return [];

  const response = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["za"],
      includeQueryPredictions: false,
      ...(sessionToken ? { sessionToken } : {}),
      locationRestriction: {
        rectangle: {
          low: {
            latitude: CAPE_TOWN_BOUNDS.south,
            longitude: CAPE_TOWN_BOUNDS.west,
          },
          high: {
            latitude: CAPE_TOWN_BOUNDS.north,
            longitude: CAPE_TOWN_BOUNDS.east,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Places autocomplete failed (${response.status})`);
  }

  const body = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string } };
      };
    }>;
  };

  const seen = new Set<string>();
  const results: PlaceSuggestion[] = [];
  for (const suggestion of body.suggestions ?? []) {
    const prediction = suggestion.placePrediction;
    const placeId = prediction?.placeId?.trim();
    const name =
      prediction?.structuredFormat?.mainText?.text?.trim() ||
      prediction?.text?.text?.trim();
    if (!placeId || !name || seen.has(placeId)) continue;
    seen.add(placeId);
    results.push({ placeId, name });
    if (results.length >= 6) break;
  }
  return results;
}

export async function verifyPlace(
  placeId: string,
  sessionToken?: string | null
): Promise<VerifiedPlace | { outside: true }> {
  const key = googlePlacesApiKey();
  const id = placeId.trim();
  if (!key || !id) {
    throw new Error("Places lookup is not configured");
  }

  const detailsUrl = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`
  );
  if (sessionToken) detailsUrl.searchParams.set("sessionToken", sessionToken);

  const response = await fetch(detailsUrl, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,displayName,location",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Place details failed (${response.status})`);
  }

  const body = (await response.json()) as {
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
  };

  const latitude = body.location?.latitude;
  const longitude = body.location?.longitude;
  const name = body.displayName?.text?.trim();
  if (
    latitude == null ||
    longitude == null ||
    !name ||
    !isInsideCapeTownBounds(latitude, longitude)
  ) {
    return { outside: true };
  }

  return {
    placeId: body.id?.trim() || id,
    name,
    latitude,
    longitude,
  };
}
