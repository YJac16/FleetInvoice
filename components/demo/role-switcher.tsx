import "server-only";

import { demoRoleOptions, isDemoEmail } from "@/lib/demo/accounts";
import { isDemoEnabled } from "@/lib/demo/guard";
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
  if (!user || !isDemoEmail(user.email)) return null;

  return (
    <DemoRoleSwitcherPanel
      options={demoRoleOptions()}
      currentEmail={user.email ?? ""}
    />
  );
}
