import {
  setKeepSignedIn,
} from "@/lib/supabase/auth-persistence";
import {
  createClient,
  resetBrowserClientCache,
} from "@/lib/supabase/client";
import { env } from "@/lib/env";

export async function signInWithPassword(
  email: string,
  password: string,
  keepSignedIn = true
) {
  setKeepSignedIn(keepSignedIn);
  resetBrowserClientCache();

  const supabase = createClient();

  if (!keepSignedIn) {
    await supabase.auth.signOut();
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/profile`,
  });
  if (error) throw error;
}

export async function signUpWithInvite(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) throw error;
  return data;
}

export async function acceptInvitationToken(token: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (error) throw error;
  return data;
}

export async function getInvitationByToken(token: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_invitation_by_token", {
    p_token: token,
  });
  if (error) throw error;
  return data as
    | {
        id: string;
        organisation_id: string;
        email: string;
        role: string;
        token: string;
        status: string;
        expires_at: string;
      }[]
    | null;
}
