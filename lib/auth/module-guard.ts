import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";

import {
  assertAnyModuleAccess,
  type ModuleAccessGranted,
} from "@/lib/auth/module-access";
import { getSessionContext } from "@/lib/auth/session";
import type { AppModule } from "@/lib/entitlements";
import type { SessionContext } from "@/types";

/**
 * Server-side module guards for layouts and API routes. The sidebar only
 * hides links; these refuse a direct URL or API call too.
 *
 * Pages are gated on the module only (no permission argument), so roles that
 * can reach a page today keep reaching it while the org is entitled.
 * Maintenance keeps its own wrapper (lib/auth/maintenance-access.ts), which
 * also checks maintenance:view / maintenance:manage.
 */

export type ModuleList = AppModule | readonly [AppModule, ...AppModule[]];

function toList(modules: ModuleList): readonly [AppModule, ...AppModule[]] {
  return typeof modules === "string" ? [modules] : modules;
}

/**
 * For layouts. Same outcomes as app/(dashboard)/maintenance/layout.tsx:
 *
 *   - no session                      -> /login
 *   - no active org                   -> 404
 *   - platform owner with active org  -> allowed (entitlement bypassed)
 *   - not a member / not entitled     -> 404 (don't reveal the module exists)
 *   - service role missing            -> error boundary
 *
 * Pass `session` when the layout already resolved it (e.g. via requireRole).
 * Step 5 replaces the 404 with an /app/no-access page.
 */
export async function guardModulePage(
  modules: ModuleList,
  resolvedSession?: SessionContext
): Promise<ModuleAccessGranted> {
  const session = resolvedSession ?? (await getSessionContext());
  if (!session) redirect("/login");

  const organisationId = session.activeOrganisationId;
  if (!organisationId) notFound();

  const access = await assertAnyModuleAccess(toList(modules), {
    organisationId,
    userId: session.userId,
  });
  if (!access.ok) {
    if (access.status === 401) redirect("/login");
    if (access.status === 503) throw new Error("This module is temporarily unavailable");
    notFound();
  }
  return access;
}

/**
 * For API routes. Returns null when allowed, otherwise a JSON response:
 * 401 unauthenticated, 403 forbidden / module_not_entitled, 503
 * service_unavailable.
 */
export async function guardModuleApi(
  modules: ModuleList,
  input: { organisationId: string; userId: string | null }
): Promise<NextResponse | null> {
  const access = await assertAnyModuleAccess(toList(modules), input);
  if (access.ok) return null;
  const res = NextResponse.json({ error: access.error }, { status: access.status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
