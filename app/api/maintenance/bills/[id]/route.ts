import { maintenanceJson as json, resolveMaintenanceBill } from "@/lib/maintenance/bill-route";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/maintenance/bills/[id]: soft delete a DRAFT workshop bill through
 * the audited delete_workshop_bill RPC (00078). Approved bills -> 409
 * bill_not_draft. Access is checked against the active org before the bill is
 * looked up (lib/maintenance/bill-route.ts): no access -> 403 for any id; a
 * bill missing, deleted or in another org -> 404. Missing service client -> 503.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const resolved = await resolveMaintenanceBill<{ id: string; organisation_id: string }>(
    id,
    "manage",
    "id, organisation_id"
  );
  if (!resolved.ok) return resolved.res;
  const { bill, access } = resolved;

  const { error } = await access.admin.rpc("delete_workshop_bill", {
    p_actor: access.userId,
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
