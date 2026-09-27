import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
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

  const { data: driverDoc } = await admin
    .from("driver_documents")
    .select("id, organisation_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  let orgId: string | null = driverDoc?.organisation_id ?? null;
  let kind: "driver" | "vehicle" = "driver";

  if (!driverDoc) {
    const { data: vehicleDoc } = await admin
      .from("vehicle_documents")
      .select("id, organisation_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!vehicleDoc) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    orgId = vehicleDoc.organisation_id;
    kind = "vehicle";
  }

  const { data: member } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId!)
    .eq("status", "active")
    .maybeSingle();

  if (
    !member ||
    !["organisation_admin", "manager", "dispatcher", "supervisor"].includes(member.role)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await admin.rpc("soft_delete_compliance_document", {
    p_actor: user.id,
    p_org: orgId,
    p_kind: kind,
    p_id: id,
  });

  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
