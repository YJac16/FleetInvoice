import { NextResponse } from "next/server";

import { FUEL_SLIP_VIEW_URL_SECONDS, FUEL_SLIPS_BUCKET } from "@/lib/fuel/constants";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ photoId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { photoId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: photo } = await supabase
    .from("fuel_slip_photos")
    .select("id, organisation_id, storage_path, purged_at")
    .eq("id", photoId)
    .maybeSingle();

  if (!photo || photo.purged_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: auditError } = await admin.rpc("audit_fuel_slip_photo_view", {
    p_actor: user.id,
    p_org: photo.organisation_id,
    p_photo_id: photoId,
  });
  if (auditError) {
    return NextResponse.json({ error: "audit_failed" }, { status: 500 });
  }

  const { data: signed, error } = await admin.storage
    .from(FUEL_SLIPS_BUCKET)
    .createSignedUrl(photo.storage_path, FUEL_SLIP_VIEW_URL_SECONDS);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
