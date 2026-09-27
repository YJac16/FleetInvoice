import { NextResponse } from "next/server";

import { COMPLIANCE_SCAN_QUOTA_CAP } from "@/lib/compliance/constants";
import {
  complianceScanProviderName,
  isComplianceScanEnvEnabled,
} from "@/lib/compliance/flags";
import { complianceScanBodySchema } from "@/lib/compliance/scan-schema";
import { normaliseScanResult } from "@/lib/compliance/scan-normalise";
import { resolveScanProvider } from "@/lib/compliance/scan/provider";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { VEHICLE_DOCS_BUCKET } from "@/services/vehicle-documents.service";

const SCAN_TIMEOUT_MS = 15_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = complianceScanBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "rejected_input" }, { status: 400 });
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const orgId = await resolveScanOrg(admin, parsed.data.subject_id, parsed.data.subject_kind);
  if (!orgId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const authorised = await scanAuthorised(admin, user.id, orgId);
  if (!authorised) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: org } = await admin
    .from("organisations")
    .select("compliance_scan_enabled")
    .eq("id", orgId)
    .maybeSingle();

  const scanEnabled =
    isComplianceScanEnvEnabled() || org?.compliance_scan_enabled === true;
  if (!scanEnabled) {
    await recordScanEvent({
      admin,
      organisationId: orgId,
      userId: user.id,
      status: "blocked_flag",
      consumedQuota: false,
      payload: parsed.data,
    });
    return NextResponse.json({ error: "scan_disabled" }, { status: 403 });
  }

  if (parsed.data.storage_mode === "scan_discard" && !scanEnabled) {
    return NextResponse.json({ error: "scan_disabled" }, { status: 403 });
  }

  const provider = resolveScanProvider(
    complianceScanProviderName(),
    process.env.NODE_ENV
  );
  if (!provider) {
    await recordScanEvent({
      admin,
      organisationId: orgId,
      userId: user.id,
      status: "rejected_input",
      consumedQuota: false,
      payload: parsed.data,
      provider: "none",
    });
    return NextResponse.json({ error: "provider_not_configured" }, { status: 503 });
  }

  const quotaOk = await admin.rpc("consume_compliance_scan_quota", {
    p_org: orgId,
    p_cap: COMPLIANCE_SCAN_QUOTA_CAP,
  });
  if (quotaOk.data !== true) {
    await recordScanEvent({
      admin,
      organisationId: orgId,
      userId: user.id,
      status: "blocked_quota",
      consumedQuota: false,
      payload: parsed.data,
      provider: provider.name,
    });
    return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
  }

  let bytes: Uint8Array | null = null;
  const tempPath: string | null = null;

  try {
    if (parsed.data.document_id) {
      const loaded = await loadRetainedDocumentBytes(admin, parsed.data.document_id);
      if (!loaded) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      bytes = loaded.bytes;
    } else if (parsed.data.storage_mode === "scan_discard") {
      return NextResponse.json({ error: "document_id_required" }, { status: 400 });
    }

    if (!bytes) {
      return NextResponse.json({ error: "rejected_input" }, { status: 400 });
    }

    const started = Date.now();
    const extractPromise = provider.extract(
      parsed.data.doc_type ?? parsed.data.subject_kind,
      bytes
    );
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), SCAN_TIMEOUT_MS);
    });

    let raw;
    try {
      raw = await Promise.race([extractPromise, timeout]);
    } catch {
      await recordScanEvent({
        admin,
        organisationId: orgId,
        userId: user.id,
        status: "failed",
        consumedQuota: true,
        payload: parsed.data,
        provider: provider.name,
        latencyMs: Date.now() - started,
      });
      return NextResponse.json(
        { error: "scan_failed", message: "Couldn't read the document. Please type the details." },
        { status: 502 }
      );
    }

    const { data: vehicle } = await admin
      .from("vehicles")
      .select("registration_number")
      .eq("id", parsed.data.subject_id)
      .maybeSingle();

    const normalised = normaliseScanResult(
      parsed.data.subject_kind,
      raw,
      vehicle?.registration_number ?? null
    );

    await recordScanEvent({
      admin,
      organisationId: orgId,
      userId: user.id,
      status: "succeeded",
      consumedQuota: true,
      payload: parsed.data,
      provider: provider.name,
      latencyMs: Date.now() - started,
      fieldsSuggested: Object.keys(normalised.fields).length,
    });

    return NextResponse.json({
      suggestions: normalised.fields,
      warnings: normalised.warnings,
    });
  } finally {
    if (tempPath) {
      await admin.storage.from(VEHICLE_DOCS_BUCKET).remove([tempPath]);
      await admin
        .from("compliance_scan_temp_objects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("storage_path", tempPath);
    }
  }
}

async function resolveScanOrg(
  admin: NonNullable<ReturnType<typeof createServiceClient>>,
  subjectId: string,
  subjectKind: string
): Promise<string | null> {
  if (subjectKind === "driver_licence" || subjectKind === "prdp") {
    const { data } = await admin
      .from("drivers")
      .select("organisation_id")
      .eq("id", subjectId)
      .maybeSingle();
    return data?.organisation_id ?? null;
  }
  const { data } = await admin
    .from("vehicles")
    .select("organisation_id")
    .eq("id", subjectId)
    .maybeSingle();
  return data?.organisation_id ?? null;
}

async function scanAuthorised(
  admin: NonNullable<ReturnType<typeof createServiceClient>>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organisation_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return false;
  return [
    "organisation_admin",
    "manager",
    "dispatcher",
    "supervisor",
  ].includes(data.role);
}

async function loadRetainedDocumentBytes(
  admin: NonNullable<ReturnType<typeof createServiceClient>>,
  documentId: string
): Promise<{ bytes: Uint8Array; path: string } | null> {
  const { data: dd } = await admin
    .from("driver_documents")
    .select("storage_path")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  const path = dd?.storage_path;
  if (!path) {
    const { data: vd } = await admin
      .from("vehicle_documents")
      .select("storage_path")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!vd?.storage_path) return null;
    return downloadObject(admin, vd.storage_path);
  }
  return downloadObject(admin, path);
}

async function downloadObject(
  admin: NonNullable<ReturnType<typeof createServiceClient>>,
  path: string
) {
  const { data, error } = await admin.storage.from(VEHICLE_DOCS_BUCKET).download(path);
  if (error || !data) return null;
  const buf = new Uint8Array(await data.arrayBuffer());
  return { bytes: buf, path };
}

async function recordScanEvent(input: {
  admin?: NonNullable<ReturnType<typeof createServiceClient>>;
  organisationId?: string;
  userId: string;
  status: string;
  consumedQuota: boolean;
  payload?: unknown;
  body?: unknown;
  provider?: string;
  latencyMs?: number;
  fieldsSuggested?: number;
}) {
  const admin = input.admin ?? createServiceClient();
  if (!admin || !input.organisationId) return;
  const payload = (input.payload ?? input.body) as {
    subject_kind?: string;
    subject_id?: string;
    document_id?: string;
    storage_mode?: string;
  };
  await admin.from("compliance_scan_events").insert({
    organisation_id: input.organisationId,
    requested_by: input.userId,
    subject_kind: payload?.subject_kind ?? "driver_licence",
    subject_id: payload?.subject_id ?? "00000000-0000-4000-8000-000000000000",
    document_id: payload?.document_id ?? null,
    storage_mode: payload?.storage_mode ?? "retained",
    provider: input.provider ?? "mock",
    status: input.status,
    consumed_quota: input.consumedQuota,
    latency_ms: input.latencyMs ?? null,
    fields_suggested: input.fieldsSuggested ?? null,
  });
}
