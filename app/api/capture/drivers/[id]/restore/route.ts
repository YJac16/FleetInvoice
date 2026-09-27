import { NextResponse } from "next/server";

import { assertFleetCaptureAccess } from "@/lib/capture/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id: driverId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const { data: driver, error: loadError } = await admin
    .from("drivers")
    .select("organisation_id, deleted_at")
    .eq("id", driverId)
    .maybeSingle();

  if (loadError || !driver || !driver.deleted_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const access = await assertFleetCaptureAccess(
    admin,
    user.id,
    driver.organisation_id
  );
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status });
  }

  const { error } = await admin.rpc("restore_driver", {
    p_actor: user.id,
    p_org: driver.organisation_id,
    p_driver_id: driverId,
  });

  if (error) {
    return NextResponse.json({ error: "restore_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
