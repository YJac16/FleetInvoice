import { NextResponse } from "next/server";

import {
  buildComplianceStoragePath,
  mimeToExt,
  resolveComplianceAuth,
} from "@/services/compliance-documents.server";
import { isComplianceScanAssistActive } from "@/lib/compliance/scan-assist";
import {
  sanitiseDisplayFileName,
  sha256Hex,
  validateComplianceFile,
} from "@/lib/compliance/file-validation";
import { rcPermanentStorageForbidden } from "@/lib/compliance/rc-policy";
import { complianceUploadFieldsSchema } from "@/lib/compliance/upload-schema";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { VEHICLE_DOCS_BUCKET } from "@/services/vehicle-documents.service";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const form = await request.formData();
  const rawFields: Record<string, string> = {};
  for (const key of [
    "subject_kind",
    "subject_id",
    "doc_type",
    "side",
    "storage_mode",
    "organisation_id",
    "uploaded_by",
    "created_by",
    "source",
    "review_status",
    "storage_path",
  ]) {
    const value = form.get(key);
    if (typeof value === "string") rawFields[key] = value;
  }

  const parsed = complianceUploadFieldsSchema.safeParse(rawFields);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }

  if (rcPermanentStorageForbidden(parsed.data.doc_type, parsed.data.storage_mode)) {
    return NextResponse.json({ error: "rc_permanent_storage_forbidden" }, { status: 403 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const auth = await resolveComplianceAuth({
    userId: user.id,
    fields: parsed.data,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.code }, { status: auth.status });
  }

  if (parsed.data.storage_mode === "scan_discard") {
    const scanAdmin = createServiceClient();
    if (!scanAdmin) {
      return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
    const { data: org } = await scanAdmin
      .from("organisations")
      .select("compliance_scan_enabled")
      .eq("id", auth.ctx.organisationId)
      .maybeSingle();
    const scanOn = isComplianceScanAssistActive(org?.compliance_scan_enabled);
    if (!scanOn) {
      return NextResponse.json({ error: "scan_disabled" }, { status: 403 });
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateComplianceFile({ bytes, declaredMime: file.type });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.code }, { status: validated.status });
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const ext = mimeToExt(validated.mime);
  const storagePath = buildComplianceStoragePath({
    organisationId: auth.ctx.organisationId,
    subjectKind: parsed.data.subject_kind,
    subjectId: parsed.data.subject_id,
    ext,
    storageMode: parsed.data.storage_mode,
  });

  const { error: uploadError } = await admin.storage
    .from(VEHICLE_DOCS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: validated.mime,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  if (parsed.data.storage_mode === "scan_discard") {
    const { data: tempRow, error: tempErr } = await admin
      .from("compliance_scan_temp_objects")
      .insert({
        organisation_id: auth.ctx.organisationId,
        storage_path: storagePath,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (tempErr || !tempRow) {
      await admin.storage.from(VEHICLE_DOCS_BUCKET).remove([storagePath]);
      return NextResponse.json({ error: "temp_track_failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      temp_only: true,
      temp_scan_id: tempRow.id,
    });
  }

  const hash = sha256Hex(bytes);
  const displayName = sanitiseDisplayFileName(file.name);

  const { data: regData, error: regError } = await admin.rpc(
    "register_compliance_document",
    {
      p_actor: user.id,
      p_org: auth.ctx.organisationId,
      p_subject_kind: parsed.data.subject_kind,
      p_subject_id: parsed.data.subject_id,
      p_doc_type: parsed.data.doc_type,
      p_side: parsed.data.side,
      p_storage_path: storagePath,
      p_file_name: displayName,
      p_mime: validated.mime,
      p_size: bytes.length,
      p_sha256: hash,
      p_source: auth.ctx.source,
      p_review_status: auth.ctx.reviewStatus,
    }
  );

  if (regError) {
    const { error: removeError } = await admin.storage
      .from(VEHICLE_DOCS_BUCKET)
      .remove([storagePath]);

    if (removeError) {
      const objectRef = sha256Hex(new TextEncoder().encode(storagePath));
      await admin.rpc("write_audit_log", {
        p_organisation_id: auth.ctx.organisationId,
        p_action: "document.orphan_cleanup_failed",
        p_entity_type: "compliance_document",
        p_entity_id: null,
        p_metadata: { object_ref: objectRef, code: removeError.message },
      });
      await admin.from("compliance_orphan_objects").insert({
        storage_path: storagePath,
        error_code: "remove_failed",
      });
    }

    return NextResponse.json({ error: "registration_failed" }, { status: 500 });
  }

  const newId = (regData as { new_id?: string })?.new_id;
  const supersededId = (regData as { superseded_id?: string | null })?.superseded_id;

  return NextResponse.json({
    ok: true,
    document_id: newId,
    superseded_id: supersededId ?? null,
  });
}
