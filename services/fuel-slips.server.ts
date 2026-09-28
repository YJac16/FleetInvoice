import { createServiceClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/constants";
import { hasPermission, type Permission } from "@/lib/permissions";

export type FuelSlipAuthContext = {
  userId: string;
  organisationId: string;
  role: AppRole;
  isPlatformOwner: boolean;
  driverId: string | null;
};

const REVIEW_ROLES: AppRole[] = ["organisation_admin"];
const BACKCAPTURE_ROLES: AppRole[] = ["organisation_admin"];

export async function resolveFuelSlipAuth(input: {
  userId: string;
  organisationId: string;
  isPlatformOwner: boolean;
  required: Permission | Permission[];
}): Promise<
  | { ok: true; ctx: FuelSlipAuthContext }
  | { ok: false; status: number; code: string }
> {
  const admin = createServiceClient();
  if (!admin) {
    return { ok: false, status: 503, code: "service_unavailable" };
  }

  if (input.isPlatformOwner) {
    const perms = Array.isArray(input.required) ? input.required : [input.required];
    const allowed = perms.some((p) => hasPermission("platform_owner", p, true));
    if (!allowed) {
      return { ok: false, status: 403, code: "forbidden" };
    }
    return {
      ok: true,
      ctx: {
        userId: input.userId,
        organisationId: input.organisationId,
        role: "organisation_admin",
        isPlatformOwner: true,
        driverId: null,
      },
    };
  }

  const { data: member, error } = await admin
    .from("organisation_members")
    .select("role, status")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !member) {
    return { ok: false, status: 403, code: "forbidden" };
  }

  const role = member.role as AppRole;
  const perms = Array.isArray(input.required) ? input.required : [input.required];
  const allowed = perms.some((p) => hasPermission(role, p, false));
  if (!allowed) {
    return { ok: false, status: 403, code: "forbidden" };
  }

  let driverId: string | null = null;
  if (role === "driver") {
    const { data: driver } = await admin
      .from("drivers")
      .select("id")
      .eq("organisation_id", input.organisationId)
      .eq("profile_id", input.userId)
      .is("deleted_at", null)
      .maybeSingle();
    driverId = driver?.id ?? null;
    if (!driverId) {
      return { ok: false, status: 403, code: "forbidden" };
    }
  }

  return {
    ok: true,
    ctx: {
      userId: input.userId,
      organisationId: input.organisationId,
      role,
      isPlatformOwner: false,
      driverId,
    },
  };
}

export function buildFuelSlipStoragePath(input: {
  organisationId: string;
  fillupId: string;
  photoId: string;
  ext: string;
}): string {
  return `${input.organisationId}/fuel-slips/${input.fillupId}/${input.photoId}.${input.ext}`;
}

export function mimeToFuelExt(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export { REVIEW_ROLES, BACKCAPTURE_ROLES };
