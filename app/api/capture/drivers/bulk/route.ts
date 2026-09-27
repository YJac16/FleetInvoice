import { NextResponse } from "next/server";
import { z } from "zod";

import { assertFleetCaptureAccess } from "@/lib/capture/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  organisationId: z.string().uuid(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
});

export async function POST(request: Request) {
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

  const { data, error } = await admin.rpc("import_drivers_capture", {
    p_actor: user.id,
    p_org: parsed.data.organisationId,
    p_rows: parsed.data.rows,
  });

  if (error) {
    return NextResponse.json({ error: "import_failed" }, { status: 500 });
  }

  const ids = (data as { ids?: string[] })?.ids ?? [];
  return NextResponse.json({ ok: true, ids });
}
