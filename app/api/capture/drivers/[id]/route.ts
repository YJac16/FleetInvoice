import { NextResponse } from "next/server";
import { z } from "zod";

import { assertFleetCaptureAccess } from "@/lib/capture/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  organisationId: z.string().uuid(),
  fields: z.record(z.string(), z.unknown()),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id: driverId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const access = await assertFleetCaptureAccess(
    admin,
    user.id,
    parsed.data.organisationId
  );
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status });
  }

  const { data: savedId, error } = await admin.rpc("save_driver_capture", {
    p_actor: user.id,
    p_org: parsed.data.organisationId,
    p_driver_id: driverId,
    p_fields: parsed.data.fields,
  });

  if (error) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: savedId ?? driverId });
}

export async function DELETE(_request: Request, context: RouteContext) {
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

  if (loadError || !driver || driver.deleted_at) {
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

  const { error } = await admin.rpc("soft_delete_driver", {
    p_actor: user.id,
    p_org: driver.organisation_id,
    p_driver_id: driverId,
  });

  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
