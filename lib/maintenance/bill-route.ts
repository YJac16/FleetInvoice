import { NextResponse } from "next/server";

import {
  assertMaintenanceAccess,
  type MaintenanceAccessGranted,
  type MaintenanceAccessMode,
} from "@/lib/auth/maintenance-access";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function maintenanceJson(body: Record<string, unknown>, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export type ResolvedMaintenanceBill<T> =
  | { ok: true; bill: T; access: MaintenanceAccessGranted }
  | { ok: false; res: Response };

/**
 * Shared order for /api/maintenance/bills/[id] routes:
 *
 *   1. malformed id                         -> 404
 *   2. no session                           -> 401
 *   3. no service client                    -> 503
 *   4. no active org                        -> 404
 *   5. maintenance access for the ACTIVE org (before any bill lookup, so a
 *      dispatcher gets the same 403 for real and unknown ids):
 *        forbidden / module_not_entitled   -> 403
 *        not a member                      -> 404
 *   6. bill by id AND active org; missing, deleted or another org's -> 404
 *
 * Active org is resolved like the maintenance pages (getSessionContext).
 */
export async function resolveMaintenanceBill<T extends { id: string; organisation_id: string }>(
  id: string,
  mode: MaintenanceAccessMode,
  columns: string
): Promise<ResolvedMaintenanceBill<T>> {
  const fail = (body: Record<string, unknown>, status: number) => ({
    ok: false as const,
    res: maintenanceJson(body, status),
  });

  if (!UUID_RE.test(id)) return fail({ error: "not_found" }, 404);

  const session = await getSessionContext();
  if (!session) return fail({ error: "unauthenticated" }, 401);

  const admin = createServiceClient();
  if (!admin) return fail({ error: "service_unavailable" }, 503);

  const organisationId = session.activeOrganisationId;
  if (!organisationId) return fail({ error: "not_found" }, 404);

  const access = await assertMaintenanceAccess(mode, {
    organisationId,
    userId: session.userId,
  });
  if (!access.ok) {
    if (access.notMember) return fail({ error: "not_found" }, 404);
    return fail({ error: access.error }, access.status);
  }

  const { data: bill, error } = await access.admin
    .from("workshop_bills")
    .select(`${columns}, deleted_at`)
    .eq("id", id)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (error) return fail({ error: "lookup_failed" }, 500);
  const row = bill as (T & { deleted_at?: string | null }) | null;
  if (!row || row.deleted_at || row.organisation_id !== organisationId) {
    return fail({ error: "not_found" }, 404);
  }

  return { ok: true, bill: row, access };
}
