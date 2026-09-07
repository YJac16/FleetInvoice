export type ServiceLocation = {
  id: string;
  organisation_id: string | null;
  name: string;
  aliases: string[];
  region: string;
  status: string;
};

export const LOCATION_AREA_SEPARATOR = " / ";

/** Split multi-drop AREA text into individual place tokens. */
export function splitAreaPlaces(value: string): string[] {
  return value
    .split(/\s*\/\s*|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Join canonical place names for invoice AREA column. */
export function joinAreaPlaces(places: string[]): string {
  return places
    .map((place) => place.trim())
    .filter(Boolean)
    .join(LOCATION_AREA_SEPARATOR);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Static typo map for common Cape Town misspellings (client + server). */
export const LOCATION_TYPO_MAP: Record<string, string> = {
  danoon: "Dunoon",
  delf: "Delft",
  eersteriver: "Eerste River",
  "eerster river": "Eerste River",
  paardeneiland: "Paarden Eiland",
  blouberg: "Bloubergstrand",
  "joe slovo": "Joe Slovo Park",
  cbd: "Cape Town CBD",
  "city bowl": "Cape Town CBD",
};

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

function catalogKeys(location: ServiceLocation): string[] {
  return [
    normalizeKey(location.name),
    ...location.aliases.map((alias) => normalizeKey(alias)),
  ];
}

export type LocationMatchResult = {
  input: string;
  canonical: string | null;
  suggestion: string | null;
  corrected: boolean;
};

export function matchLocationToken(
  token: string,
  locations: ServiceLocation[]
): LocationMatchResult {
  const trimmed = token.trim();
  if (!trimmed) {
    return { input: token, canonical: null, suggestion: null, corrected: false };
  }

  const key = normalizeKey(trimmed);
  const typo = LOCATION_TYPO_MAP[key];
  if (typo) {
    return {
      input: trimmed,
      canonical: typo,
      suggestion: typo,
      corrected: typo.toLowerCase() !== trimmed.toLowerCase(),
    };
  }

  for (const location of locations) {
    if (catalogKeys(location).includes(key)) {
      return {
        input: trimmed,
        canonical: location.name,
        suggestion: null,
        corrected: location.name.toLowerCase() !== trimmed.toLowerCase(),
      };
    }
  }

  let best: { name: string; distance: number } | null = null;
  for (const location of locations) {
    const distance = levenshtein(key, normalizeKey(location.name));
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { name: location.name, distance };
    }
    for (const alias of location.aliases) {
      const aliasDistance = levenshtein(key, normalizeKey(alias));
      if (aliasDistance <= 2 && (!best || aliasDistance < best.distance)) {
        best = { name: location.name, distance: aliasDistance };
      }
    }
  }

  if (best) {
    return {
      input: trimmed,
      canonical: best.name,
      suggestion: best.name,
      corrected: best.name.toLowerCase() !== trimmed.toLowerCase(),
    };
  }

  return {
    input: trimmed,
    canonical: trimmed,
    suggestion: null,
    corrected: false,
  };
}

export function normalizeAreaValue(
  value: string,
  locations: ServiceLocation[]
): { value: string; corrections: LocationMatchResult[] } {
  const parts = splitAreaPlaces(value);
  const corrections: LocationMatchResult[] = [];
  const canonicalParts = parts.map((part) => {
    const result = matchLocationToken(part, locations);
    corrections.push(result);
    return result.canonical ?? part;
  });
  return { value: joinAreaPlaces(canonicalParts), corrections };
}

export function filterLocationSuggestions(
  query: string,
  locations: ServiceLocation[],
  limit = 8
): ServiceLocation[] {
  const key = normalizeKey(query);
  if (!key) {
    return locations.slice(0, limit);
  }
  return locations
    .filter((location) => {
      const keys = catalogKeys(location);
      return keys.some((candidate) => candidate.includes(key));
    })
    .slice(0, limit);
}
