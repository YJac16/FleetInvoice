import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import { googlePlacesEnabled } from "@/lib/maps/google-places.server";

export async function GET() {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }
  return NextResponse.json({ enabled: googlePlacesEnabled() });
}
