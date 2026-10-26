import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  organisationId: z.string().uuid(),
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        recorded_at: z.string().optional(),
        accuracy_m: z.number().nonnegative().nullable().optional(),
        vehicle_id: z.string().uuid().nullable().optional(),
        trip_id: z.string().uuid().nullable().optional(),
        driver_id: z.string().uuid().nullable().optional(),
      })
    )
    .min(1)
    .max(100),
});

/**
 * Authenticated GPS batch ingest (Phase 7). Prefer client RPC for driver portal;
 * this route supports partners / non-browser clients with a user session cookie.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("ingest_gps_points", {
    p_organisation_id: parsed.data.organisationId,
    p_points: parsed.data.points,
  });

  if (error) {
    // P0001 = a message raised on purpose by the RPC (safe to show); anything else stays generic.
    const message = error.code === "P0001" ? error.message : "Could not record GPS points";
    if (error.code !== "P0001") console.error("gps.ingest failed", error.code);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ inserted: data as number });
}
