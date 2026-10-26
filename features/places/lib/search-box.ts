import { CAPE_TOWN_CENTER, CAPE_TOWN_SEARCH_BBOX } from "@/lib/maps/cape-town";
import { MAX_PLACE_LENGTH } from "@/features/trips/lib/trip-route-text";

/**
 * Thin client for the Mapbox Search Box API (/suggest + /retrieve).
 *
 * IMPORTANT: Mapbox documents Search Box coverage for the US, Canada and
 * Europe; South Africa coverage is UNVERIFIED. Callers must treat every
 * failure / empty result as "keep what the user typed". Mapbox results are
 * "temporary use only", so we only ever store the user-visible, editable text
 * (never coordinates or a mapbox_id).
 */

export const SEARCH_BOX_BASE_URL = "https://api.mapbox.com/search/searchbox/v1";
export const MIN_QUERY_LENGTH = 3;
export const SEARCH_DEBOUNCE_MS = 300;
export const SUGGEST_LIMIT = 6;
export const SUGGEST_TYPES = "poi,address,street,neighborhood,locality";

export type PlaceSuggestion = {
  mapboxId: string;
  name: string;
  /** e.g. "Cape Town, Western Cape, South Africa" (display only). */
  placeFormatted: string;
  featureType: string;
};

export function newSessionToken(): string {
  return globalThis.crypto.randomUUID();
}

export function isSearchableQuery(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

export function buildSuggestParams(
  query: string,
  accessToken: string,
  sessionToken: string
): URLSearchParams {
  return new URLSearchParams({
    q: query.trim(),
    access_token: accessToken,
    session_token: sessionToken,
    country: "za",
    bbox: CAPE_TOWN_SEARCH_BBOX,
    proximity: CAPE_TOWN_CENTER.join(","),
    types: SUGGEST_TYPES,
    language: "en",
    limit: String(SUGGEST_LIMIT),
  });
}

type SuggestionResponse = {
  suggestions?: Array<{
    mapbox_id?: string;
    name?: string;
    place_formatted?: string;
    feature_type?: string;
  }>;
};

type FetchLike = typeof fetch;

export async function suggestPlaces(
  query: string,
  opts: {
    accessToken: string;
    sessionToken: string;
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
  }
): Promise<PlaceSuggestion[]> {
  // Never hit the API for short/blank input.
  if (!isSearchableQuery(query)) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${SEARCH_BOX_BASE_URL}/suggest?${buildSuggestParams(
    query,
    opts.accessToken,
    opts.sessionToken
  )}`;
  const res = await doFetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const json = (await res.json()) as SuggestionResponse;
  const out: PlaceSuggestion[] = [];
  for (const s of json.suggestions ?? []) {
    const name = s.name?.trim();
    if (!s.mapbox_id || !name) continue;
    out.push({
      mapboxId: s.mapbox_id,
      name,
      placeFormatted: s.place_formatted?.trim() ?? "",
      featureType: s.feature_type ?? "",
    });
  }
  return out;
}

type RetrieveResponse = {
  features?: Array<{
    properties?: { name?: string; place_formatted?: string };
  }>;
};

/**
 * Completes the Search Box session for the picked suggestion. Only the
 * display text is used by callers; coordinates/ids are deliberately dropped.
 */
export async function retrievePlaceText(
  suggestion: PlaceSuggestion,
  opts: {
    accessToken: string;
    sessionToken: string;
    signal?: AbortSignal;
    fetchImpl?: FetchLike;
  }
): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    access_token: opts.accessToken,
    session_token: opts.sessionToken,
    language: "en",
  });
  const url = `${SEARCH_BOX_BASE_URL}/retrieve/${encodeURIComponent(
    suggestion.mapboxId
  )}?${params}`;
  const res = await doFetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Place lookup failed (${res.status})`);
  const json = (await res.json()) as RetrieveResponse;
  const props = json.features?.[0]?.properties;
  return placeDisplayText({
    ...suggestion,
    name: props?.name?.trim() || suggestion.name,
    placeFormatted: props?.place_formatted?.trim() || suggestion.placeFormatted,
  });
}

/**
 * Editable text that goes into the input: the place name plus its
 * suburb/locality when that fits (<= 120 chars, no "|" or newlines).
 */
export function placeDisplayText(
  s: Pick<PlaceSuggestion, "name" | "placeFormatted">
): string {
  const name = sanitizePlaceText(s.name);
  const locality = sanitizePlaceText(s.placeFormatted.split(",")[0] ?? "");
  const withLocality =
    locality && !name.toLowerCase().includes(locality.toLowerCase())
      ? `${name}, ${locality}`
      : name;
  return (withLocality.length <= MAX_PLACE_LENGTH ? withLocality : name).slice(
    0,
    MAX_PLACE_LENGTH
  );
}

function sanitizePlaceText(value: string): string {
  return value.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}
