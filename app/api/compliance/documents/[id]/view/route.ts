import { NextResponse } from "next/server";

import { COMPLIANCE_VIEW_URL_SECONDS } from "@/lib/compliance/constants";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { VEHICLE_DOCS_BUCKET } from "@/services/vehicle-documents.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: driverDoc } = await supabase
    .from("driver_documents")
    .select("id, organisation_id, storage_path, mime_type, deleted_at")
    .eq("id", id)
    .maybeSingle();

  let storagePath: string | null = null;
  let organisationId: string | null = null;

  if (driverDoc && !driverDoc.deleted_at) {
    storagePath = driverDoc.storage_path;
    organisationId = driverDoc.organisation_id;
  } else {
    const { data: vehicleDoc } = await supabase
      .from("vehicle_documents")
      .select("id, organisation_id, storage_path, mime_type, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (!vehicleDoc || vehicleDoc.deleted_at) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    storagePath = vehicleDoc.storage_path;
    organisationId = vehicleDoc.organisation_id;
  }

  const admin = createServiceClient();
  if (!admin || !storagePath || !organisationId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: auditError } = await admin.rpc("audit_compliance_document_view", {
    p_actor: user.id,
    p_org: organisationId,
    p_document_id: id,
  });
  if (auditError) {
    return NextResponse.json({ error: "audit_failed" }, { status: 500 });
  }

  const { data: signed, error } = await admin.storage
    .from(VEHICLE_DOCS_BUCKET)
    .createSignedUrl(storagePath, COMPLIANCE_VIEW_URL_SECONDS);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
