"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_REMEMBER_ME, ROUTES } from "@/lib/constants";
import { env, hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/supabase/server";

export type AuthActionResult =
  | { success: true; message?: string }
  | { success: false; error: string };

function missingConfigResult(): AuthActionResult {
  return {
    success: false,
    error:
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
  };
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
  rememberMe: boolean;
  next?: string;
}): Promise<AuthActionResult> {
  if (!hasSupabaseConfig()) return missingConfigResult();

  const supabase = await createClient();
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_REMEMBER_ME, input.rememberMe ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const destination =
    input.next && input.next.startsWith("/") ? input.next : ROUTES.dashboard;
  redirect(destination);
}

export async function requestPasswordReset(
  email: string
): Promise<AuthActionResult> {
  if (!hasSupabaseConfig()) return missingConfigResult();

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.appUrl}/auth/callback?next=${ROUTES.settings}`,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    message: "If an account exists for that email, a reset link has been sent.",
  };
}

export async function signOut(): Promise<void> {
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect(ROUTES.login);
}
