import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Relative import required for Edge middleware bundling on Vercel.
import { env, isSupabaseConfigured } from "../env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite");
  const isPublicApiRoute =
    pathname.startsWith("/api/notifications/process") ||
    pathname.startsWith("/api/cron/notifications") ||
    pathname.startsWith("/api/webhooks/stripe");

  if (!user && !isPublicAuthRoute && !isPublicApiRoute && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (
    user &&
    (pathname === "/login" || pathname === "/forgot-password") &&
    !pathname.startsWith("/invite")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/hub";
    return NextResponse.redirect(url);
  }

  // White-label: resolve hostname → org theme (fail soft if migration not applied)
  try {
    const host = (request.headers.get("host") ?? "")
      .split(":")[0]
      .toLowerCase();
    if (host && !host.includes("localhost") && !host.endsWith(".vercel.app")) {
      const { data } = await supabase.rpc("lookup_white_label", {
        p_hostname: host,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.organisation_id) {
        const payload = JSON.stringify({
          organisation_id: row.organisation_id,
          logo_url: row.logo_url,
          primary_color: row.primary_color,
          accent_color: row.accent_color,
        });
        supabaseResponse.cookies.set("workops_wl", payload, {
          path: "/",
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
        });
      }
    }
  } catch {
    // RPC may be missing before 00014 — ignore
  }

  return supabaseResponse;
}
