import { NextResponse } from "next/server";
import { z } from "zod";

import {
  GEOCODE_PROXIMITY,
  parseMapboxFeature,
  type GeocodedPlace,
} from "@/features/areas/lib/geocode";
import { env, isMapboxConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  if (!isMapboxConfigured()) {
    return NextResponse.json(
      { error: "Mapbox is not configured" },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = env.NEXT_PUBLIC_MAPBOX_TOKEN!;
  const [lng, lat] = GEOCODE_PROXIMITY;
  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(parsed.data.q)}.json`
  );
  endpoint.searchParams.set("access_token", token);
  endpoint.searchParams.set("autocomplete", "true");
  endpoint.searchParams.set("limit", "6");
  endpoint.searchParams.set("country", "za");
  endpoint.searchParams.set("proximity", `${lng},${lat}`);
  endpoint.searchParams.set(
    "types",
    "place,locality,neighborhood,address,poi"
  );

  const response = await fetch(endpoint, { next: { revalidate: 0 } });
  if (!response.ok) {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }

  const body = (await response.json()) as { features?: unknown[] };
  const places: GeocodedPlace[] = [];
  for (const feature of body.features ?? []) {
    const parsedPlace = parseMapboxFeature(
      feature as Parameters<typeof parseMapboxFeature>[0]
    );
    if (parsedPlace) places.push(parsedPlace);
  }

  return NextResponse.json({ places });
}
