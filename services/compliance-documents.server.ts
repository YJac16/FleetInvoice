import { createServiceClient } from "@/lib/supabase/admin";
import type { ComplianceUploadFields } from "@/lib/compliance/upload-schema";
import { rcPermanentStorageForbidden } from "@/lib/compliance/rc-policy";

export type ComplianceAuthContext = {
  userId: string;
  organisationId: string;
  source: "admin";
  reviewStatus: "accepted";
  isOps: boolean;
};

const OPS_ROLES = [
  "organisation_admin",
  "manager",
  "dispatcher",
  "supervisor",
] as const;

export async function resolveComplianceAuth(input: {
  userId: string;
  fields: ComplianceUploadFields;
}): Promise<
  | { ok: true; ctx: ComplianceAuthContext }
  | { ok: false; status: number; code: string }
> {
  const admin = createServiceClient();
  if (!admin) {
    return { ok: false, status: 503, code: "service_unavailable" };
  }

  const { data: memberships, error: memErr } = await admin
    .from("organisation_members")
    .select("organisation_id, role, status")
    .eq("user_id", input.userId)
    .eq("status", "active");

  if (memErr) {
    return { ok: false, status: 500, code: "membership_lookup_failed" };
  }

  let organisationId: string | null = null;

  if (input.fields.subject_kind === "driver") {
    const { data: driver, error } = await admin
      .from("drivers")
      .select("organisation_id, id, profile_id, deleted_at")
      .eq("id", input.fields.subject_id)
      .maybeSingle();
    if (error || !driver || driver.deleted_at) {
      return { ok: false, status: 403, code: "forbidden" };
    }
    organisationId = driver.organisation_id;
  } else {
    const { data: vehicle, error } = await admin
      .from("vehicles")
      .select("organisation_id, id, deleted_at")
      .eq("id", input.fields.subject_id)
      .maybeSingle();
    if (error || !vehicle || vehicle.deleted_at) {
      return { ok: false, status: 403, code: "forbidden" };
    }
    organisationId = vehicle.organisation_id;
  }

  const member = (memberships ?? []).find((m) => m.organisation_id === organisationId);
  if (!member) {
    return { ok: false, status: 403, code: "forbidden" };
  }

  if (member.role === "driver") {
    return { ok: false, status: 403, code: "driver_compliance_write_forbidden" };
  }

  const isOps = OPS_ROLES.includes(member.role as (typeof OPS_ROLES)[number]);
  if (!isOps) {
    return { ok: false, status: 403, code: "forbidden" };
  }

  const source = "admin" as const;
  const reviewStatus = "accepted" as const;

  if (rcPermanentStorageForbidden(input.fields.doc_type, input.fields.storage_mode)) {
    return { ok: false, status: 403, code: "rc_permanent_storage_forbidden" };
  }

  const allowedDoc =
    input.fields.subject_kind === "driver"
      ? ["driver_licence", "prdp"]
      : input.fields.storage_mode === "scan_discard"
        ? ["license_disk", "operating_permit", "registration_certificate"]
        : ["license_disk", "operating_permit"];
  if (!allowedDoc.includes(input.fields.doc_type)) {
    return { ok: false, status: 400, code: "invalid_doc_type" };
  }

  return {
    ok: true,
    ctx: {
      userId: input.userId,
      organisationId: organisationId!,
      source,
      reviewStatus,
      isOps,
    },
  };
}

export function buildComplianceStoragePath(input: {
  organisationId: string;
  subjectKind: "driver" | "vehicle";
  subjectId: string;
  ext: string;
  storageMode: "retained" | "scan_discard";
}): string {
  const id = crypto.randomUUID();
  if (input.storageMode === "scan_discard") {
    return `${input.organisationId}/tmp-scan/${id}.${input.ext}`;
  }
  const folder = input.subjectKind === "driver" ? "drivers" : "vehicles";
  return `${input.organisationId}/${folder}/${input.subjectId}/${id}.${input.ext}`;
}

export function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}
