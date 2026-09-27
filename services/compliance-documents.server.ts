import { createServiceClient } from "@/lib/supabase/admin";
import type { ComplianceUploadFields } from "@/lib/compliance/upload-schema";
import {
  isComplianceDriverUploadsEnvEnabled,
} from "@/lib/compliance/flags";

export type ComplianceAuthContext = {
  userId: string;
  organisationId: string;
  source: "admin" | "driver";
  reviewStatus: "accepted" | "pending_review";
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

  const isOps = OPS_ROLES.includes(member.role as (typeof OPS_ROLES)[number]);
  let source: "admin" | "driver" = "admin";
  let reviewStatus: "accepted" | "pending_review" = "accepted";

  if (isOps) {
    source = "admin";
    reviewStatus = "accepted";
  } else if (member.role === "driver") {
    if (input.fields.subject_kind !== "driver") {
      return { ok: false, status: 403, code: "forbidden" };
    }
    const { data: org } = await admin
      .from("organisations")
      .select("compliance_driver_uploads_enabled")
      .eq("id", organisationId)
      .maybeSingle();
    const driverUploads =
      org?.compliance_driver_uploads_enabled || isComplianceDriverUploadsEnvEnabled();
    if (!driverUploads) {
      return { ok: false, status: 403, code: "driver_uploads_disabled" };
    }
    const { data: driverRow } = await admin
      .from("drivers")
      .select("profile_id")
      .eq("id", input.fields.subject_id)
      .maybeSingle();
    if (driverRow?.profile_id !== input.userId) {
      return { ok: false, status: 403, code: "forbidden" };
    }
    source = "driver";
    reviewStatus = "pending_review";
  } else {
    return { ok: false, status: 403, code: "forbidden" };
  }

  const allowedDoc =
    input.fields.subject_kind === "driver"
      ? ["driver_licence", "prdp"]
      : ["license_disk", "operating_permit", "registration_certificate"];
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
