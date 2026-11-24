import "server-only";

import {
  DEMO_ORG_SLUG,
  demoRoleOptions,
  findDemoAccountByEmail,
} from "@/lib/demo/accounts";
import { isDemoEnabled } from "@/lib/demo/guard";
import { FAIL_OPEN_MODULES, isAppModule, type AppModule } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";

import { DemoRoleSwitcherPanel } from "./role-switcher-panel";

/**
 * DEMO ONLY. Renders nothing unless the demo guard passes (DEMO_MODE=true AND
 * the demo Supabase project ref) and the viewer is a mapped demo account.
 */
export async function DemoRoleSwitcher() {
  if (!isDemoEnabled()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? findDemoAccountByEmail(user.email) : null;
  if (!user || !account) return null;

  const entitledModules = await demoOrgEntitledModules(supabase);

  return (
    <DemoRoleSwitcherPanel
      options={demoRoleOptions()}
      currentEmail={user.email ?? ""}
      currentRole={account.role}
      entitledModules={entitledModules}
    />
  );
}

type UserClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The demo org's modules via org_entitled_modules (user client, so RLS and the
 * RPC's own membership check apply). Any failure, or an empty result, falls
 * back to FAIL_OPEN_MODULES, which never includes portal or passengers.
 */
async function demoOrgEntitledModules(supabase: UserClient): Promise<AppModule[]> {
  try {
    const { data: org } = await supabase
      .from("organisations")
      .select("id")
      .eq("slug", DEMO_ORG_SLUG)
      .maybeSingle();
    const orgId = (org as { id?: string } | null)?.id;
    if (!orgId) return FAIL_OPEN_MODULES;
    const { data, error } = await supabase.rpc("org_entitled_modules", {
      p_organisation_id: orgId,
    });
    if (error) return FAIL_OPEN_MODULES;
    const modules = ((data ?? []) as unknown[]).filter(
      (m): m is AppModule => typeof m === "string" && isAppModule(m)
    );
    return modules.length ? modules : FAIL_OPEN_MODULES;
  } catch {
    return FAIL_OPEN_MODULES;
  }
}
