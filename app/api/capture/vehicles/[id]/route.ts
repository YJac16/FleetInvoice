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
  const { id: vehicleId } = await context.params;
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

  const { data: savedId, error } = await admin.rpc("save_vehicle_capture", {
    p_actor: user.id,
    p_org: parsed.data.organisationId,
    p_vehicle_id: vehicleId,
    p_fields: parsed.data.fields,
  });

  if (error) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: savedId ?? vehicleId });
}
