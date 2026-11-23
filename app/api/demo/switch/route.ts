import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { hubPathForRole } from "@/lib/auth/hub-redirect";
import { ORG_COOKIE_NAME } from "@/lib/constants";
import {
  DEMO_ORG_SLUG,
  findDemoAccountByRole,
  isDemoEmail,
} from "@/lib/demo/accounts";
import { isDemoEnabled } from "@/lib/demo/guard";
import { demoSwitchRateLimited } from "@/lib/demo/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * DEMO ONLY. Swaps the current demo session to another pre-seeded demo
 * account. No passwords: a magic-link token is minted server-side with the
 * service role and verified immediately in this request (never sent to the
 * browser). 404 everywhere the demo guard is off (i.e. live).
 */
export async function POST(request: NextRequest) {
  if (!isDemoEnabled()) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!isDemoEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const target = findDemoAccountByRole(
    body && typeof body === "object" ? (body as { role?: unknown }).role : null
  );
  if (!target) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (demoSwitchRateLimited(user.id)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Demo not configured" }, { status: 500 });
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return NextResponse.json({ error: "Switch failed" }, { status: 500 });
  }

  await supabase.auth.signOut({ scope: "local" });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (verifyError) {
    return NextResponse.json({ error: "Switch failed" }, { status: 500 });
  }

  const { data: org } = await admin
    .from("organisations")
    .select("id")
    .eq("slug", DEMO_ORG_SLUG)
    .maybeSingle();

  if (org?.id) {
    const cookieStore = await cookies();
    cookieStore.set(ORG_COOKIE_NAME, org.id as string, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return NextResponse.json({
    ok: true,
    role: target.role,
    redirectTo: hubPathForRole(target.role),
  });
}
