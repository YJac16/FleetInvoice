"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { formValuesToPayload } from "@/features/maintenance/lib/bill-form-values";
import { mapMaintenanceRpcError } from "@/features/maintenance/lib/rpc-errors";
import { supplierFormSchema } from "@/features/maintenance/schemas/supplier";
import { billFormSchema } from "@/features/maintenance/schemas/workshop-bill";
import type { MaintenanceActionResult } from "@/features/maintenance/types";
import { assertMaintenanceAccess } from "@/lib/auth/maintenance-access";
import { getSessionContext } from "@/lib/auth/session";

/**
 * Server actions for fleet maintenance writes. Each one:
 *   1. takes the org from the session (never from the client),
 *   2. checks assertMaintenanceAccess('manage'),
 *   3. validates the input with the same zod schema as the form,
 *   4. calls the audited service_role RPC from 00074 with p_actor = the user.
 * Totals are never taken from the client; the RPC recomputes them.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Denied = Extract<MaintenanceActionResult, { ok: false }>;

async function resolveWriter(): Promise<
  { ok: true; userId: string; organisationId: string; admin: SupabaseClient } | Denied
> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthenticated", message: "Please sign in again." };
  const organisationId = session.activeOrganisationId;
  if (!organisationId) {
    return { ok: false, error: "forbidden", message: "Choose an organisation first." };
  }
  const access = await assertMaintenanceAccess("manage", {
    organisationId,
    userId: session.userId,
  });
  if (!access.ok) {
    if (access.status === 503) {
      return { ok: false, error: "service_unavailable", message: "Maintenance is temporarily unavailable." };
    }
    return {
      ok: false,
      error: access.error,
      message: "You don't have permission to change maintenance records.",
    };
  }
  return { ok: true, userId: session.userId, organisationId, admin: access.admin };
}

function zodFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function saveWorkshopBillAction(
  billId: string | null,
  values: unknown
): Promise<MaintenanceActionResult> {
  if (billId !== null && (typeof billId !== "string" || !UUID_RE.test(billId))) {
    return { ok: false, error: "not_found", message: "That bill no longer exists." };
  }

  const writer = await resolveWriter();
  if (!writer.ok) return writer;

  const parsed = billFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      message: "Check the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  const { data, error } = await writer.admin.rpc("save_workshop_bill", {
    p_actor: writer.userId,
    p_org: writer.organisationId,
    p_id: billId,
    p_payload: formValuesToPayload(parsed.data),
  });
  if (error || typeof data !== "string") {
    const mapped = mapMaintenanceRpcError(error);
    return {
      ok: false,
      error: mapped.error,
      message: mapped.message,
      fieldErrors: mapped.field ? { [mapped.field]: mapped.message } : undefined,
    };
  }

  revalidatePath("/maintenance/bills");
  revalidatePath(`/maintenance/bills/${data}`);
  return { ok: true, id: data };
}

export async function createSupplierAction(values: unknown): Promise<MaintenanceActionResult> {
  const writer = await resolveWriter();
  if (!writer.ok) return writer;

  const parsed = supplierFormSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      message: "Check the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error.issues),
    };
  }

  const { data, error } = await writer.admin.rpc("save_supplier", {
    p_actor: writer.userId,
    p_org: writer.organisationId,
    p_id: null,
    p_payload: { ...parsed.data, active: true },
  });
  if (error || typeof data !== "string") {
    const mapped = mapMaintenanceRpcError(error);
    return {
      ok: false,
      error: mapped.error,
      message: mapped.message,
      fieldErrors: mapped.field ? { [mapped.field]: mapped.message } : undefined,
    };
  }

  revalidatePath("/maintenance/suppliers");
  revalidatePath("/maintenance/bills/new");
  return { ok: true, id: data };
}

/**
 * Delete (soft, audited) a draft workshop bill. Approved bills can't be
 * deleted and there is no reopen. The RPC re-checks status under a row lock.
 */
export async function deleteWorkshopBillAction(billId: string): Promise<MaintenanceActionResult> {
  if (typeof billId !== "string" || !UUID_RE.test(billId)) {
    return { ok: false, error: "not_found", message: "That bill no longer exists." };
  }

  const writer = await resolveWriter();
  if (!writer.ok) return writer;

  const { error } = await writer.admin.rpc("delete_workshop_bill", {
    p_actor: writer.userId,
    p_org: writer.organisationId,
    p_id: billId,
  });
  if (error) {
    const mapped = mapMaintenanceRpcError(error);
    const failed = mapped.error === "save_failed";
    return {
      ok: false,
      error: failed ? "delete_failed" : mapped.error,
      message: failed ? "Couldn't delete. Please try again." : mapped.message,
    };
  }

  revalidatePath("/maintenance/bills");
  revalidatePath(`/maintenance/bills/${billId}`);
  return { ok: true, id: billId };
}

/**
 * Finalise a draft workshop bill (one-way). Calls approve_workshop_bill, which
 * locks the bill, audits 'workshop_bill.approved' and is service_role only.
 * The DB value stays 'approved'; the UI calls it "Final". There is no reopen.
 */
export async function finaliseWorkshopBillAction(billId: string): Promise<MaintenanceActionResult> {
  if (typeof billId !== "string" || !UUID_RE.test(billId)) {
    return { ok: false, error: "not_found", message: "That bill no longer exists." };
  }

  const writer = await resolveWriter();
  if (!writer.ok) return writer;

  const { error } = await writer.admin.rpc("approve_workshop_bill", {
    p_actor: writer.userId,
    p_org: writer.organisationId,
    p_id: billId,
  });
  if (error) {
    const mapped = mapMaintenanceRpcError(error);
    const failed = mapped.error === "save_failed";
    return {
      ok: false,
      error: failed ? "finalise_failed" : mapped.error,
      message: failed ? "Couldn't finalise. Please try again." : mapped.message,
    };
  }

  revalidatePath("/maintenance/bills");
  revalidatePath(`/maintenance/bills/${billId}`);
  return { ok: true, id: billId };
}
