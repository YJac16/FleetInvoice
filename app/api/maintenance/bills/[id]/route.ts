import { NextResponse } from "next/server";

import {
  assertMaintenanceAccess,
  getMaintenanceUserId,
} from "@/lib/auth/maintenance-access";
import { createServiceClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/**
 * DELETE /api/maintenance/bills/[id]: soft delete a DRAFT workshop bill through
 * the audited delete_workshop_bill RPC (00078). Approved bills -> 409
 * bill_not_draft. A caller outside the bill's org gets 404. Missing service
 * client -> 503.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return json({ error: "not_found" }, 404);

  const userId = await getMaintenanceUserId();
  if (!userId) return json({ error: "unauthenticated" }, 401);

  const admin = createServiceClient();
  if (!admin) return json({ error: "service_unavailable" }, 503);

  const { data: bill, error: lookupError } = await admin
    .from("workshop_bills")
    .select("id, organisation_id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) return json({ error: "lookup_failed" }, 500);
  if (!bill || bill.deleted_at) return json({ error: "not_found" }, 404);

  const access = await assertMaintenanceAccess("manage", {
    organisationId: bill.organisation_id,
    userId,
  });
  if (!access.ok) {
    if (access.notMember) return json({ error: "not_found" }, 404);
    return json({ error: access.error }, access.status);
  }

  const { error } = await access.admin.rpc("delete_workshop_bill", {
    p_actor: userId,
    p_org: bill.organisation_id,
    p_id: id,
  });
  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`;
    if (message.includes("bill_not_draft")) return json({ error: "bill_not_draft" }, 409);
    if (message.includes("not_found")) return json({ error: "not_found" }, 404);
    if (message.includes("module_not_entitled")) return json({ error: "module_not_entitled" }, 403);
    if (message.includes("not_authorised")) return json({ error: "forbidden" }, 403);
    return json({ error: "delete_failed" }, 500);
  }

  return json({ ok: true });
}
