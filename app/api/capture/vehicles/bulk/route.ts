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

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }

  const orgId =
    body !== null &&
    typeof body === "object" &&
    "organisationId" in body &&
    typeof (body as { organisationId?: unknown }).organisationId === "string"
      ? (body as { organisationId: string }).organisationId
      : null;

  if (orgId) {
    const access = await assertFleetCaptureAccess(admin, user.id, orgId);
    if (!access.ok) {
      return NextResponse.json({ error: access.code }, { status: access.status });
    }
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("import_vehicles_capture", {
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
