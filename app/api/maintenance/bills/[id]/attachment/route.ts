import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  assertMaintenanceAccess,
  getMaintenanceUserId,
  type MaintenanceAccessGranted,
  type MaintenanceAccessMode,
} from "@/lib/auth/maintenance-access";
import {
  buildWorkshopBillPath,
  validateWorkshopBillFile,
  WORKSHOP_BILL_MAX_BYTES,
  WORKSHOP_BILL_VIEW_URL_SECONDS,
  WORKSHOP_BILLS_BUCKET,
} from "@/lib/maintenance/attachment";
import { createServiceClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

type BillRow = {
  id: string;
  organisation_id: string;
  status: string;
  attachment_path: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Room for multipart boundaries and headers on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function json(body: Record<string, unknown>, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * Load the bill with the service role, then check the caller against the
 * bill's organisation. A caller with no membership in that org gets 404, so
 * another org's bill ids don't leak.
 */
async function resolveBill(
  id: string,
  mode: MaintenanceAccessMode
): Promise<{ ok: true; bill: BillRow; access: MaintenanceAccessGranted } | { ok: false; res: Response }> {
  if (!UUID_RE.test(id)) return { ok: false, res: json({ error: "not_found" }, 404) };

  const userId = await getMaintenanceUserId();
  if (!userId) return { ok: false, res: json({ error: "unauthenticated" }, 401) };

  const admin = createServiceClient();
  if (!admin) return { ok: false, res: json({ error: "service_unavailable" }, 503) };

  const { data: bill, error } = await admin
    .from("workshop_bills")
    .select("id, organisation_id, status, attachment_path, attachment_mime, attachment_size, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, res: json({ error: "lookup_failed" }, 500) };
  if (!bill || bill.deleted_at) return { ok: false, res: json({ error: "not_found" }, 404) };

  const access = await assertMaintenanceAccess(mode, {
    organisationId: bill.organisation_id,
    userId,
  });
  if (!access.ok) {
    if (access.notMember) return { ok: false, res: json({ error: "not_found" }, 404) };
    return { ok: false, res: json({ error: access.error }, access.status) };
  }

  return { ok: true, bill: bill as BillRow, access };
}

function rpcErrorResponse(message: string) {
  if (message.includes("bill_approved_locked")) return json({ error: "bill_approved_locked" }, 409);
  if (message.includes("not_found")) return json({ error: "not_found" }, 404);
  if (message.includes("module_not_entitled")) return json({ error: "module_not_entitled" }, 403);
  if (message.includes("not_authorised")) return json({ error: "forbidden" }, 403);
  return json({ error: "attach_failed" }, 500);
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const resolved = await resolveBill(id, "manage");
  if (!resolved.ok) return resolved.res;
  const { bill, access } = resolved;
  const admin = access.admin;

  if (bill.status === "approved") {
    return json({ error: "bill_approved_locked" }, 409);
  }

  // Refuse obviously oversized bodies before buffering them.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > WORKSHOP_BILL_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return json({ error: "file_too_large" }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "invalid_form" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "file_required" }, 400);
  }
  if (file.size > WORKSHOP_BILL_MAX_BYTES) {
    return json({ error: "file_too_large" }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateWorkshopBillFile({ bytes, declaredMime: file.type });
  if (!validated.ok) {
    return json({ error: validated.code }, validated.status);
  }

  const storagePath = buildWorkshopBillPath({
    organisationId: bill.organisation_id,
    billId: bill.id,
    objectId: randomUUID(),
    mime: validated.mime,
  });

  const { error: uploadError } = await admin.storage
    .from(WORKSHOP_BILLS_BUCKET)
    .upload(storagePath, bytes, { contentType: validated.mime, upsert: false });
  if (uploadError) {
    return json({ error: "upload_failed" }, 500);
  }

  const { data: previousPath, error: rpcError } = await admin.rpc("set_workshop_bill_attachment", {
    p_actor: access.userId,
    p_org: bill.organisation_id,
    p_bill_id: bill.id,
    p_path: storagePath,
    p_mime: validated.mime,
    p_size: bytes.length,
  });

  if (rpcError) {
    // The bill didn't take the file: don't leave it in the bucket.
    await admin.storage.from(WORKSHOP_BILLS_BUCKET).remove([storagePath]);
    return rpcErrorResponse(rpcError.message ?? "");
  }

  // Replaced an earlier attachment: remove the old object. Best effort; the
  // bill already points at the new file.
  if (typeof previousPath === "string" && previousPath && previousPath !== storagePath) {
    await admin.storage.from(WORKSHOP_BILLS_BUCKET).remove([previousPath]);
  }

  return json({
    ok: true,
    attachment: { mime: validated.mime, size: bytes.length },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const resolved = await resolveBill(id, "view");
  if (!resolved.ok) return resolved.res;
  const { bill, access } = resolved;

  if (!bill.attachment_path) {
    return json({ error: "no_attachment" }, 404);
  }

  const { data: signed, error } = await access.admin.storage
    .from(WORKSHOP_BILLS_BUCKET)
    .createSignedUrl(bill.attachment_path, WORKSHOP_BILL_VIEW_URL_SECONDS);
  if (error || !signed?.signedUrl) {
    return json({ error: "sign_failed" }, 500);
  }

  return json({
    url: signed.signedUrl,
    expires_in: WORKSHOP_BILL_VIEW_URL_SECONDS,
    mime: bill.attachment_mime,
    size: bill.attachment_size,
  });
}
