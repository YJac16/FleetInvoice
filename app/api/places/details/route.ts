import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import {
  googlePlacesEnabled,
  verifyPlace,
} from "@/lib/maps/google-places.server";

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!googlePlacesEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    placeId?: unknown;
    sessionToken?: unknown;
  } | null;
  const placeId = typeof body?.placeId === "string" ? body.placeId.trim() : "";
  const sessionToken =
    typeof body?.sessionToken === "string" ? body.sessionToken.slice(0, 200) : "";
  if (!placeId || placeId.length > 300) {
    return NextResponse.json({ error: "Place is required" }, { status: 400 });
  }

  try {
    const place = await verifyPlace(placeId, sessionToken);
    if ("outside" in place) {
      return NextResponse.json(
        { enabled: true, outside: true },
        { status: 422 }
      );
    }
    return NextResponse.json({ enabled: true, place });
  } catch {
    return NextResponse.json(
      { error: "Place check is unavailable" },
      { status: 502 }
    );
  }
}
