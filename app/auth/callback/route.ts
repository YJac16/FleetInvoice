import { NextResponse } from "next/server";

import { ROUTES } from "@/lib/constants";
import { createClient } from "@/supabase/server";

/**
 * Handles Supabase auth callbacks (email confirmation, password recovery).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? ROUTES.dashboard;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${ROUTES.login}?error=auth_callback`);
}
