import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  organisationId: z.string().uuid().nullable(),
  action: z.string().min(1).max(200),
  entityType: z.string().min(1).max(200),
  entityId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

  if (parsed.data.organisationId) {
    const { data: member } = await admin
      .from("organisation_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organisation_id", parsed.data.organisationId)
      .eq("status", "active")
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await admin.rpc("write_audit_log", {
    p_organisation_id: parsed.data.organisationId,
    p_action: parsed.data.action,
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId ?? null,
    p_metadata: parsed.data.metadata ?? {},
    p_actor: user.id,
  });

  if (error) {
    return NextResponse.json({ error: "audit_write_failed" }, { status: 500 });
  }

  return NextResponse.json({ id: data });
}
