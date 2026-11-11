import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import {
  autocompletePlaces,
  googlePlacesEnabled,
} from "@/lib/maps/google-places.server";

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!googlePlacesEnabled()) {
    return NextResponse.json({ enabled: false, suggestions: [] });
  }

  const body = (await request.json().catch(() => null)) as {
    input?: unknown;
    sessionToken?: unknown;
  } | null;
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  const sessionToken =
    typeof body?.sessionToken === "string" ? body.sessionToken.slice(0, 200) : "";
  if (input.length < 2 || input.length > 120) {
    return NextResponse.json({ enabled: true, suggestions: [] });
  }

  try {
    const suggestions = await autocompletePlaces(input, sessionToken);
    return NextResponse.json({ enabled: true, suggestions });
  } catch {
    return NextResponse.json(
      { enabled: true, suggestions: [], error: "Place search is unavailable" },
      { status: 502 }
    );
  }
}
