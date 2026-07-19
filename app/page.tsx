import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";
import { hasSupabaseConfig } from "@/lib/env";
import { getSessionContext } from "@/services/profile.service";

export default async function HomePage() {
  if (!hasSupabaseConfig()) {
    redirect(ROUTES.dashboard);
  }

  const session = await getSessionContext();
  redirect(session ? ROUTES.dashboard : ROUTES.login);
}
