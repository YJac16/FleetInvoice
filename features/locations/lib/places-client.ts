export type MapPlaceSuggestion = {
  placeId: string;
  name: string;
};

export async function fetchPlacesLookupEnabled(): Promise<boolean> {
  try {
    const response = await fetch("/api/places/config");
    if (!response.ok) return false;
    const body = (await response.json()) as { enabled?: boolean };
    return body.enabled === true;
  } catch {
    return false;
  }
}

export async function searchMapPlaces(
  input: string,
  sessionToken?: string
): Promise<MapPlaceSuggestion[]> {
  const response = await fetch("/api/places/autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, sessionToken }),
  });
  if (!response.ok) return [];
  const body = (await response.json()) as {
    suggestions?: MapPlaceSuggestion[];
  };
  return (body.suggestions ?? []).filter(
    (item) => item.placeId && item.name
  );
}

export async function verifyMapPlace(placeId: string, sessionToken?: string): Promise<
  | { name: string; placeId: string; latitude: number; longitude: number }
  | { outside: true }
  | null
> {
  const response = await fetch("/api/places/details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId, sessionToken }),
  });
  if (response.status === 422) return { outside: true };
  if (!response.ok) return null;
  const body = (await response.json()) as {
    place?: {
      name: string;
      placeId: string;
      latitude: number;
      longitude: number;
    };
  };
  return body.place ?? null;
}
