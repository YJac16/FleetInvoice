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
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("ingest_gps_points", {
    p_organisation_id: parsed.data.organisationId,
    p_points: parsed.data.points,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ inserted: data as number });
}
